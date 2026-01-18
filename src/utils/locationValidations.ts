import { type InventoryItem } from '../schemas/inventory.schema';

/**
 * Location Validation Utilities
 * Advanced validation system with errors (blocking) and warnings (overridable)
 */

interface ValidationWarning {
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
    recommendation: string;
    canOverride: boolean;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: ValidationWarning[];
    canProceedWithOverride: boolean;
}

/**
 * Valida que la capacidad propuesta sea válida para el inventario actual
 * Retorna warnings que pueden ser overridden por el usuario
 */
export const validateCapacityChange = (
    newCapacity: number,
    currentInventory: InventoryItem[],
    originalCapacity: number | null = null
): ValidationResult => {
    const totalUnits = currentInventory.reduce((sum, item) =>
        sum + (Number(item.Quantity) || 0), 0
    );

    const warnings: ValidationWarning[] = [];
    const errors: string[] = [];

    // ERROR: Capacidad debe ser positiva (NO OVERRIDE)
    if (newCapacity < 1) {
        errors.push('Capacity must be at least 1 unit');
    }

    // ERROR: Límite superior (NO OVERRIDE)
    if (newCapacity > 10000) {
        errors.push('Maximum capacity allowed is 10,000 units');
    }

    // Si la capacidad NO ha cambiado, no mostramos warnings (solo errores si los hubiera)
    const capacityHasChanged = originalCapacity !== null && newCapacity !== originalCapacity;

    if (originalCapacity !== null && !capacityHasChanged) {
        return {
            isValid: errors.length === 0,
            errors,
            warnings: [],
            canProceedWithOverride: false
        };
    }

    // WARNING: Capacidad menor que inventario actual (CON OVERRIDE)
    if (newCapacity < totalUnits) {
        warnings.push({
            type: 'CAPACITY_OVERFLOW',
            severity: 'high',
            message: `Capacity (${newCapacity}) is less than current inventory (${totalUnits} units).`,
            recommendation: 'Consider moving products first or increasing capacity.',
            canOverride: true
        });
    }

    // WARNING: Cambio drástico de capacidad (CON OVERRIDE) - Solo si hay una base de comparación real
    if (originalCapacity !== null && capacityHasChanged) {
        const percentChange = Math.abs((newCapacity - originalCapacity) / originalCapacity * 100);

        if (percentChange > 50) {
            warnings.push({
                type: 'DRASTIC_CHANGE',
                severity: 'medium',
                message: `Significant capacity change: ${percentChange.toFixed(0)}%`,
                recommendation: 'Verify that this is intentional.',
                canOverride: true
            });
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        canProceedWithOverride: errors.length === 0 && warnings.length > 0
    };
};

/**
 * Verifica si la ubicación tiene inventario activo
 */
export const hasActiveInventory = (warehouse: string, location: string, inventory: InventoryItem[]): boolean => {
    return inventory.some(
        item => item.Warehouse === warehouse &&
            item.Location === location &&
            (item.Quantity || 0) > 0
    );
};

interface ImpactDetail {
    type: string;
    message: string;
    details: string[];
    reportIds?: string[];
}

interface LocationChangeImpact {
    affectedSKUs: number;
    totalUnits: number;
    skuList: string[];
    impacts: ImpactDetail[];
}

interface LocationChanges {
    zone?: any;
    max_capacity?: any;
    picking_order?: any;
    [key: string]: any;
}

/**
 * Calcula el impacto completo de cambiar cualquier atributo de la ubicación
 */
export const calculateLocationChangeImpact = (
    warehouse: string,
    location: string,
    changes: LocationChanges,
    inventory: InventoryItem[],
    optimizationReports: any[] = [] // TODO: Define OptimizationReport type when migrating reports
): LocationChangeImpact => {
    const affectedItems = inventory.filter(
        item => item.Warehouse === warehouse && item.Location === location
    );

    const impact: LocationChangeImpact = {
        affectedSKUs: affectedItems.length,
        totalUnits: affectedItems.reduce((sum, item) => sum + (item.Quantity || 0), 0),
        skuList: affectedItems.map(item => item.SKU),
        impacts: []
    };

    // Analyze specific changes
    if (changes.zone) {
        impact.impacts.push({
            type: 'ZONE_CHANGE',
            message: `Zone change will affect the priority of ${impact.affectedSKUs} SKU(s)`,
            details: [
                'Optimized picking routes will be recalculated',
                'Movement suggestions will change',
                'The picking order will be modified'
            ]
        });
    }

    if (changes.max_capacity) {
        impact.impacts.push({
            type: 'CAPACITY_CHANGE',
            message: 'Capacity change will affect consolidation suggestions',
            details: [
                'Suggested inbound locations will change',
                'The capacity indicator will be updated'
            ]
        });
    }

    if (changes.picking_order) {
        impact.impacts.push({
            type: 'ORDER_CHANGE',
            message: 'The picking order will change for this location',
            details: [
                'May affect the efficiency of existing routes'
            ]
        });
    }

    // Verify affected optimization reports
    const affectedReports = optimizationReports.filter(report => {
        // Verify if the report includes this location
        return report.suggestions?.items?.some(
            (item: any) => item.promote?.location === location || item.demote?.location === location
        );
    });

    if (affectedReports.length > 0) {
        impact.impacts.push({
            type: 'REPORTS_INVALIDATED',
            message: `${affectedReports.length} optimization report(s) will be invalidated`,
            details: affectedReports.map((r: any) => `Report from ${new Date(r.report_date || r.generated_at).toLocaleDateString()}`),
            reportIds: affectedReports.map((r: any) => r.id)
        });
    }

    return impact;
};
