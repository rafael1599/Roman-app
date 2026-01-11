import { useState, useEffect } from 'react';

export const useMovementForm = (initialSourceItem) => {
    const [formData, setFormData] = useState({
        quantity: 0,
        targetLocation: '',
        targetWarehouse: 'LUDLOW',
        scanValue: ''
    });

    useEffect(() => {
        if (initialSourceItem) {
            setFormData(prev => ({
                ...prev,
                quantity: initialSourceItem.Quantity,
                targetWarehouse: initialSourceItem.Warehouse
            }));
        } else {
            setFormData({
                quantity: 0,
                targetLocation: '',
                targetWarehouse: 'LUDLOW',
                scanValue: ''
            });
        }
    }, [initialSourceItem]);

    const setField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const validate = () => {
        const errors = [];
        if (!initialSourceItem) errors.push("No source item selected");
        if (formData.quantity <= 0) errors.push("Quantity must be greater than 0");
        if (formData.quantity > (initialSourceItem?.Quantity || 0)) errors.push("Quantity exceeds available stock");
        if (!formData.targetLocation) errors.push("Target location is required");
        if (formData.targetLocation === initialSourceItem?.Location && formData.targetWarehouse === initialSourceItem?.Warehouse) {
            errors.push("Cannot move to the same location");
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    };

    return {
        formData,
        setField,
        validate,
        setFormData
    };
};
