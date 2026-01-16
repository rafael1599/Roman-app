import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { LogOut, X, Check, Sun, Moon } from 'lucide-react';

export const UserMenu = ({ isOpen, onClose }) => {
    const { profile, signOut, updateProfileName } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [newName, setNewName] = useState(profile?.full_name || '');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!newName.trim()) return;
        setIsSaving(true);
        const { success } = await updateProfileName(newName);
        if (success) {
            setIsEditing(false);
        }
        setIsSaving(false);
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-sm bg-card border border-subtle rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-content">User Profile</h2>
                            <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-1">Manage your account</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-surface rounded-full text-muted transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {/* Preferences Section */}
                        <div className="p-4 bg-surface rounded-2xl border border-subtle">
                            <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-4 block">Visual Preferences</label>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-card border border-subtle rounded-xl text-content">
                                        {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-content uppercase tracking-tight">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                                        <p className="text-[9px] text-muted font-bold uppercase">Smooth UI Appearance</p>
                                    </div>
                                </div>
                                <button
                                    onClick={toggleTheme}
                                    className={`
                                        relative w-14 h-7 rounded-full p-1 transition-all duration-300 focus:outline-none ring-1 
                                        ${theme === 'dark' ? 'bg-accent/20 ring-accent/30' : 'bg-subtle ring-subtle/50'}
                                    `}
                                    aria-label="Toggle Theme"
                                >
                                    <div
                                        className={`
                                            w-5 h-5 bg-accent rounded-full shadow-lg transition-all duration-300 transform
                                            ${theme === 'dark' ? 'translate-x-7 rotate-0' : 'translate-x-0 rotate-180'}
                                        `}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Name Section */}
                        <div className="p-4 bg-surface rounded-2xl border border-subtle">
                            <label className="text-[10px] text-muted font-black uppercase tracking-widest mb-3 block">Full Name</label>

                            {isEditing ? (
                                <div className="flex gap-2">
                                    <input
                                        autoFocus
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="flex-1 bg-card border border-subtle rounded-xl px-4 py-2 text-sm text-content focus:outline-none focus:border-accent/50"
                                    />
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="ios-btn items-center justify-center h-10 w-12 bg-accent text-white shadow-lg active:scale-90 disabled:opacity-50 transition-all"
                                    >
                                        {isSaving ? <div className="w-5 h-5 border-2 border-white/20 border-t-white animate-spin rounded-full" /> : <Check size={20} />}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex justify-between items-center group cursor-pointer" onClick={() => setIsEditing(true)}>
                                    <span className="text-lg font-bold text-content tracking-tight">{profile?.full_name || 'Set Name'}</span>
                                    <button className="text-[10px] text-accent font-black uppercase tracking-[0.2em] group-hover:underline transition-all">Edit</button>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                            <button
                                onClick={signOut}
                                className="ios-btn w-full h-14 bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 text-red-500 transition-all font-black uppercase tracking-[0.2em] text-[10px]"
                            >
                                <LogOut size={16} />
                                Log Out
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-surface border-t border-subtle flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-card border border-subtle flex items-center justify-center text-muted uppercase font-bold">
                        {profile?.full_name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-muted truncate">{profile?.role?.toUpperCase()} ACCOUNT</p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
