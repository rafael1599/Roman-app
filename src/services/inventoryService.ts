import { resolveLocationName } from '../utils/locationUtils';
import { supabase } from '../lib/supabase';
import { type InventoryItem, InventoryItemSchema } from '../schemas/inventory.schema';
import { type Location } from '../schemas/location.schema';
import { validateData } from '../utils/validate';

/**
 * Service to encapsulate complex inventory business logic.
 * Decoupled from React hooks to allow for testing and better organization.
 *
 * Part of Phase 2: Service Isolation.
 */

export interface InventoryServiceContext {
  isAdmin: boolean;
  userInfo: { performed_by: string; user_id?: string };
  trackLog: (logData: any, userInfo: any) => Promise<string | null>;
  onLocationCreated?: (newLoc: Location) => void;
}

export const inventoryService = {
  /**
   * Resolves a location name logic is now delegated to Utils.
   */
  resolveLocationName(warehouse: string, inputLocation: string, locations: Location[]) {
    return resolveLocationName(locations, warehouse, inputLocation);
  },

  /**
   * Orchestrates adding a new item, including auto-creating locations if needed.
   */
  async addItem(
    warehouse: string,
    newItem: any,
    locations: Location[],
    ctx: InventoryServiceContext
  ) {
    const { isAdmin, userInfo, trackLog, onLocationCreated } = ctx;

    // Sanitize SKU to remove spaces and ensure it's not empty
    const sanitizedSku = (newItem.SKU || '').trim().replace(/\s/g, '');
    if (!sanitizedSku) {
      throw new Error('SKU cannot be empty.');
    }
    newItem.SKU = sanitizedSku;

    const qty = parseInt(newItem.Quantity) || 0;
    const inputLocation = newItem.Location || '';

    const {
      name: targetLocation,
      id: existingId,
      isNew,
    } = this.resolveLocationName(warehouse, inputLocation, locations);
    let locationId = existingId;

    if (isNew && !isAdmin) {
      throw new Error(
        `Unauthorized: Only administrators can create new locations ("${targetLocation}").`
      );
    }

    if (isNew && isAdmin) {
      const { data: newLoc, error: locError } = await supabase
        .from('locations')
        .insert([
          {
            warehouse,
            location: targetLocation,
            max_capacity: 550,
            zone: 'UNASSIGNED',
            is_active: true,
          },
        ])
        .select()
        .single();

      if (locError) throw locError;
      if (newLoc) {
        locationId = newLoc.id;
        if (onLocationCreated) onLocationCreated(newLoc as Location);
      }
    }

    // Check if item exists in this location to update instead of insert
    const { data: existingItemData } = await supabase
      .from('inventory')
      .select('*')
      .eq('SKU', newItem.SKU)
      .eq('Warehouse', warehouse)
      .eq('Location', targetLocation)
      .maybeSingle();

    if (existingItemData) {
      const existingItem = validateData(InventoryItemSchema, existingItemData);
      const newTotal = (existingItem.Quantity || 0) + qty;

      const { error } = await supabase
        .from('inventory')
        .update({
          Quantity: newTotal,
          location_id: locationId,
        })
        .eq('id', existingItem.id);

      if (error) throw error;

      await trackLog(
        {
          sku: newItem.SKU || '',
          to_warehouse: warehouse,
          to_location: targetLocation,
          quantity: qty,
          prev_quantity: existingItem.Quantity,
          new_quantity: newTotal,
          action_type: 'ADD',
          item_id: String(existingItem.id),
          is_reversed: newItem.isReversal || false,
        },
        userInfo
      );

      return { action: 'updated', id: existingItem.id };
    }

    // Insert new item
    const itemToInsert: any = {
      SKU: newItem.SKU || '',
      Location: targetLocation,
      location_id: locationId,
      Quantity: qty,
      Location_Detail: newItem.Location_Detail || '',
      Warehouse: warehouse,
      Status: newItem.Status || 'Active',
    };

    // PHASE 3: ID Restoration logic
    if (newItem.force_id) {
      itemToInsert.id = newItem.force_id;
    }

    const { data: insertedData, error: insertError } = await supabase
      .from('inventory')
      .insert([itemToInsert])
      .select()
      .single();

    if (insertError) throw insertError;

    await trackLog(
      {
        sku: newItem.SKU || '',
        to_warehouse: warehouse,
        to_location: targetLocation,
        quantity: qty,
        prev_quantity: 0,
        new_quantity: qty,
        action_type: 'ADD',
        item_id: String(insertedData.id),
        is_reversed: newItem.isReversal || false,
      },
      userInfo
    );

    return { action: 'inserted', id: insertedData.id };
  },

  /**
   * Detailed movement logic between locations.
   */
  async moveItem(
    sourceItem: InventoryItem,
    targetWarehouse: string,
    targetLocation: string,
    qty: number,
    locations: Location[],
    ctx: InventoryServiceContext,
    isReversal = false
  ) {
    const { isAdmin, userInfo, trackLog, onLocationCreated } = ctx;

    // 0. Server-side check
    const { data: serverItem, error: checkError } = await supabase
      .from('inventory')
      .select('Quantity')
      .eq('id', sourceItem.id)
      .single();

    if (checkError || !serverItem) throw new Error('Item no longer exists in source.');
    if (serverItem.Quantity < qty) {
      throw new Error(
        `Stock mismatch: Found ${serverItem.Quantity} units, but tried to move ${qty}.`
      );
    }

    const {
      name: resolvedTargetLocation,
      id: existingId,
      isNew,
    } = this.resolveLocationName(targetWarehouse, targetLocation, locations);
    let locationId = existingId;

    if (isNew && !isAdmin) {
      throw new Error(
        `Unauthorized: Only administrators can create new locations ("${resolvedTargetLocation}").`
      );
    }

    if (isNew && isAdmin) {
      const { data: newLoc, error: locError } = await supabase
        .from('locations')
        .insert([
          {
            warehouse: targetWarehouse,
            location: resolvedTargetLocation,
            max_capacity: 550,
            zone: 'UNASSIGNED',
            is_active: true,
          },
        ])
        .select()
        .single();

      if (locError) throw locError;
      if (newLoc) {
        locationId = newLoc.id;
        if (onLocationCreated) onLocationCreated(newLoc as Location);
      }
    }

    // 1. Update Source
    const remainingQty = sourceItem.Quantity - qty;
    const { error: sourceError } = await supabase
      .from('inventory')
      .update({ Quantity: remainingQty })
      .eq('id', sourceItem.id);
    if (sourceError) throw sourceError;

    // 2. Update Destination
    const { data: existingTargetData } = await supabase
      .from('inventory')
      .select('*')
      .eq('SKU', sourceItem.SKU)
      .eq('Warehouse', targetWarehouse)
      .eq('Location', resolvedTargetLocation)
      .maybeSingle();

    if (existingTargetData) {
      const existingTarget = validateData(InventoryItemSchema, existingTargetData);
      const newQty = (existingTarget.Quantity || 0) + qty;
      const { error: targetError } = await supabase
        .from('inventory')
        .update({
          Quantity: newQty,
          location_id: locationId,
        })
        .eq('id', existingTarget.id);
      if (targetError) throw targetError;
    } else {
      const { error: insertError } = await supabase.from('inventory').insert([
        {
          SKU: sourceItem.SKU,
          Warehouse: targetWarehouse,
          Location: resolvedTargetLocation,
          location_id: locationId,
          Quantity: qty,
          Location_Detail: sourceItem.Location_Detail,
          Status: sourceItem.Status || 'Active',
        },
      ]);
      if (insertError) throw insertError;
    }

    // 3. Track Log
    await trackLog(
      {
        sku: sourceItem.SKU,
        from_warehouse: sourceItem.Warehouse,
        from_location: sourceItem.Location,
        to_warehouse: targetWarehouse,
        to_location: resolvedTargetLocation,
        quantity: qty,
        prev_quantity: sourceItem.Quantity,
        new_quantity: remainingQty,
        action_type: 'MOVE',
        is_reversed: isReversal,
      },
      userInfo
    );
  },

  async updateItem(
    originalItem: InventoryItem,
    updatedFormData: any,
    locations: Location[],
    ctx: InventoryServiceContext
  ) {
    const { isAdmin, userInfo, trackLog, onLocationCreated } = ctx;

    // 1. Sanitize Inputs
    const newSku = (updatedFormData.SKU || '').trim().replace(/\s/g, '');
    const inputLocation = (updatedFormData.Location || '').trim();
    const newQty = Math.max(0, parseInt(updatedFormData.Quantity) || 0);

    if (!newSku) throw new Error('SKU cannot be empty.');

    // 2. Fetch Source Item (Race Condition Verification)
    console.log(`[InventoryService] Fetching source item for update: ID=${originalItem.id}`);
    const { data: sourceItemData, error: fetchError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', originalItem.id)
      .single();

    if (fetchError) {
      console.error('[InventoryService] Fetch Error:', fetchError);
      throw fetchError;
    }

    if (!sourceItemData) {
      throw new Error(
        `Original item with ID "${originalItem.id}" not found. It may have been deleted or moved.`
      );
    }

    const sourceItem = validateData(InventoryItemSchema, sourceItemData);

    // 3. Resolve Target Location
    const {
      name: targetLocation,
      id: existingLocId,
      isNew,
    } = this.resolveLocationName(
      updatedFormData.Warehouse || sourceItem.Warehouse,
      inputLocation || sourceItem.Location,
      locations
    );
    let locationId = existingLocId;

    if (isNew && !isAdmin) throw new Error('Unauthorized: Only admins can create new locations.');

    if (isNew && isAdmin) {
      // Auto-create location
      const { data: newLoc } = await supabase
        .from('locations')
        .insert([
          {
            warehouse: updatedFormData.Warehouse || sourceItem.Warehouse,
            location: targetLocation,
            max_capacity: 550,
            zone: 'UNASSIGNED',
            is_active: true,
          },
        ])
        .select()
        .single();

      if (newLoc) {
        locationId = newLoc.id;
        if (onLocationCreated) onLocationCreated(newLoc as Location);
      }
    }

    const targetWarehouse = updatedFormData.Warehouse || sourceItem.Warehouse;

    // 4. Check for Merge Collision (Does the NEW identity already exist?)
    // Identity = (SKU + Warehouse + Location)
    const isIdentityChange =
      newSku !== sourceItem.SKU ||
      targetWarehouse !== sourceItem.Warehouse ||
      targetLocation !== sourceItem.Location;

    if (isIdentityChange) {
      const { data: existingTargetData } = await supabase
        .from('inventory')
        .select('*')
        .eq('SKU', newSku)
        .eq('Warehouse', targetWarehouse)
        .eq('Location', targetLocation)
        .neq('id', sourceItem.id) // Don't match self
        .maybeSingle();

      if (existingTargetData) {
        // MERGE SCENARIO
        const existingTarget = validateData(InventoryItemSchema, existingTargetData);

        // FIXED: When editing an item, use the quantity from updatedFormData as the final state.
        // The user's edit represents the TOTAL they want, not an addition.
        const finalQty = newQty;

        console.log(
          `[Merge] Updating ${sourceItem.SKU} (Qty: ${sourceItem.Quantity}) at ${sourceItem.Location} to match existing ${existingTarget.SKU} (Qty: ${existingTarget.Quantity}) at ${targetLocation} -> Setting to ${finalQty}`
        );

        // A. Update Target with User's Desired Quantity
        const { error: updateError } = await supabase
          .from('inventory')
          .update({ Quantity: finalQty })
          .eq('id', existingTarget.id);

        if (updateError) throw updateError;

        // B. Handle Source Removal (Staff can now DELETE)
        const { error: deleteError } = await supabase
          .from('inventory')
          .delete()
          .eq('id', sourceItem.id);
        if (deleteError) throw deleteError;

        // C. Log the Merge (as an Edit/Transfer)
        await trackLog(
          {
            sku: newSku, // Surviving SKU
            from_warehouse: sourceItem.Warehouse,
            from_location: sourceItem.Location, // Was here
            to_warehouse: targetWarehouse,
            to_location: targetLocation, // Is now here (merged)
            quantity: sourceItem.Quantity, // Amount added/merged
            prev_quantity: existingTarget.Quantity, // What target had before
            new_quantity: finalQty, // What target has now
            action_type: 'EDIT', // Log as Edit to preserve "Renamed" semantics in history
            previous_sku: sourceItem.SKU, // Important for Undo
            item_id: existingTarget.id, // THE MERGED ITEM ID
            is_reversed: updatedFormData.isReversal || false,
          },
          userInfo
        );

        return { action: 'merged', source: sourceItem.SKU, target: newSku };
      }
    }

    // 5. Standard Update (No Collision)
    const { error: updateError } = await supabase
      .from('inventory')
      .update({
        SKU: newSku,
        Location: targetLocation,
        location_id: locationId,
        Quantity: newQty,
        Location_Detail: updatedFormData.Location_Detail,
        Warehouse: targetWarehouse,
        Status: updatedFormData.Status || sourceItem.Status,
      })
      .eq('id', sourceItem.id);

    if (updateError) throw updateError;

    // 6. Log Standard Update
    const isMove =
      targetWarehouse !== sourceItem.Warehouse || targetLocation !== sourceItem.Location;
    await trackLog(
      {
        sku: newSku,
        from_warehouse: sourceItem.Warehouse,
        from_location: sourceItem.Location || undefined,
        to_warehouse: targetWarehouse,
        to_location: targetLocation || undefined,
        quantity: Math.abs(newQty - (parseInt(sourceItem.Quantity as any) || 0)),
        prev_quantity: parseInt(sourceItem.Quantity as any) || 0,
        new_quantity: newQty,
        action_type: isMove ? 'MOVE' : 'EDIT',
        previous_sku: sourceItem.SKU !== newSku ? sourceItem.SKU : undefined,
        item_id: String(sourceItem.id), // Ensure it is string
        is_reversed: updatedFormData.isReversal || false,
      },
      userInfo
    );

    return { action: 'updated', sku: newSku };
  },

  /**
   * Data repair: Sync NULL location_ids to matching records in locations table.
   */
  async syncInventoryLocations(inventoryData: InventoryItem[], locations: Location[]) {
    const legacyItems = inventoryData.filter((item) => !item.location_id);

    // Elimination of Waterfall: Parallelize legacy items sync
    const results = await Promise.all(
      legacyItems.map(async (item) => {
        const config = locations.find(
          (l) =>
            l.warehouse === item.Warehouse &&
            item.Location &&
            l.location.toLowerCase() === item.Location.toLowerCase() &&
            l.is_active
        );

        if (config) {
          const { error } = await supabase
            .from('inventory')
            .update({ location_id: config.id })
            .eq('id', item.id);

          return !error;
        }
        return false;
      })
    );

    const successCount = results.filter(Boolean).length;
    const failCount = results.length - successCount;

    return { successCount, failCount };
  },
};
