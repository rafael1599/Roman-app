/**
 * Location Validation Utilities
 * Advanced validation system with errors (blocking) and warnings (overridable)
 */

/**
 * Valida que la capacidad propuesta sea válida para el inventario actual
 * Retorna warnings que pueden ser overridden por el usuario
 */
export const validateCapacityChange = (newCapacity, currentInventory, originalCapacity = null) => {
    const totalUnits = currentInventory.reduce((sum, item) =>
        sum + (parseInt(item.Quantity) || 0), 0
    );

    const warnings = [];
    const errors = [];

    // ERROR: Capacidad debe ser positiva (NO OVERRIDE)
    if (newCapacity < 1) {
        errors.push('La capacidad debe ser al menos 1 unidad');
    }

    // ERROR: Límite superior (NO OVERRIDE)
    if (newCapacity > 10000) {
        errors.push('La capacidad máxima permitida es 10,000 unidades');
    }

    // Si la capacidad NO ha cambiado, no mostramos warnings (solo errores si los hubiera)
    const capacityHasChanged = originalCapacity !== null && parseInt(newCapacity) !== parseInt(originalCapacity);

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
            message: `La capacidad (${newCapacity}) es menor que el inventario actual (${totalUnits} unidades).`,
            recommendation: 'Considera mover productos primero o aumentar la capacidad.',
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
                message: `Cambio significativo de capacidad: ${percentChange.toFixed(0)}%`,
                recommendation: 'Verifica que sea intencional.',
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
export const hasActiveInventory = (warehouse, location, inventory) => {
    return inventory.some(
        item => item.Warehouse === warehouse &&
            item.Location === location &&
            (item.Quantity || 0) > 0
    );
};

/**
 * Calcula el impacto completo de cambiar cualquier atributo de la ubicación
 */
export const calculateLocationChangeImpact = (warehouse, location, changes, inventory, optimizationReports = []) => {
    const affectedItems = inventory.filter(
        item => item.Warehouse === warehouse && item.Location === location
    );

    const impact = {
        affectedSKUs: affectedItems.length,
        totalUnits: affectedItems.reduce((sum, item) => sum + (item.Quantity || 0), 0),
        skuList: affectedItems.map(item => item.SKU),
        impacts: []
    };

    // Analizar cambios específicos
    if (changes.zone) {
        impact.impacts.push({
            type: 'ZONE_CHANGE',
            message: `Cambio de zona afectará la prioridad de ${impact.affectedSKUs} SKU(s)`,
            details: [
                'Rutas de picking optimizadas se recalcularán',
                'Sugerencias de movimiento cambiarán',
                'El orden de picking se modificará'
            ]
        });
    }

    if (changes.max_capacity) {
        impact.impacts.push({
            type: 'CAPACITY_CHANGE',
            message: 'Cambio de capacidad afectará sugerencias de consolidación',
            details: [
                'Las ubicaciones sugeridas para inbound cambiarán',
                'El indicador de capacidad se actualizará'
            ]
        });
    }

    if (changes.picking_order) {
        impact.impacts.push({
            type: 'ORDER_CHANGE',
            message: 'El orden de picking cambiará para esta ubicación',
            details: [
                'Puede afectar la eficiencia de rutas existentes'
            ]
        });
    }

    // Verificar reportes de optimización afectados
    const affectedReports = optimizationReports.filter(report => {
        // Verificar si el reporte incluye esta ubicación
        return report.suggestions?.items?.some(
            item => item.promote?.location === location || item.demote?.location === location
        );
    });

    if (affectedReports.length > 0) {
        impact.impacts.push({
            type: 'REPORTS_INVALIDATED',
            message: `${affectedReports.length} reporte(s) de optimización serán invalidados`,
            details: affectedReports.map(r => `Reporte del ${new Date(r.report_date || r.generated_at).toLocaleDateString()}`),
            reportIds: affectedReports.map(r => r.id)
        });
    }

    return impact;
};
