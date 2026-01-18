import React, { createContext, useContext, useState, useCallback } from 'react';

const ConfirmationContext = createContext(null);

export const ConfirmationProvider = ({ children }) => {
    const [confirmationState, setConfirmationState] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
        onClose: () => {},
        confirmText: 'Confirm',
        cancelText: 'Cancel'
    });

    const showConfirmation = useCallback((title, message, onConfirm, onClose, confirmText, cancelText) => {
        setConfirmationState({
            isOpen: true,
            title,
            message,
            onConfirm: () => {
                onConfirm();
                setConfirmationState(prev => ({ ...prev, isOpen: false }));
            },
            onClose: () => {
                onClose && onClose();
                setConfirmationState(prev => ({ ...prev, isOpen: false }));
            },
            confirmText,
            cancelText
        });
    }, []);

    const hideConfirmation = useCallback(() => {
        setConfirmationState(prev => ({ ...prev, isOpen: false }));
    }, []);

    return (
        <ConfirmationContext.Provider value={{ confirmationState, showConfirmation, hideConfirmation }}>
            {children}
            {/* The modal itself will be rendered in App.jsx */}
        </ConfirmationContext.Provider>
    );
};

export const useConfirmation = () => {
    const context = useContext(ConfirmationContext);
    if (!context) {
        throw new Error('useConfirmation must be used within a ConfirmationProvider');
    }
    return context;
};
