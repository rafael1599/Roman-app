import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, LogOut, X, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

export const UserMenu = ({ isOpen, onClose }) => {
    const { profile, signOut, updateProfileName } = useAuth();
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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-white">User Profile</h2>
                            <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1">Manage your account</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-500 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {/* Name Section */}
                        <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800/50">
                            <label className="text-[10px] text-neutral-600 font-black uppercase tracking-widest mb-3 block">Full Name</label>

                            {isEditing ? (
                                <div className="flex gap-2">
                                    <input
                                        autoFocus
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
                                    />
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="p-2 bg-green-500 text-black rounded-xl hover:bg-green-400 disabled:opacity-50 transition-all font-bold"
                                    >
                                        {isSaving ? <div className="w-5 h-5 border-2 border-black/20 border-t-black animate-spin rounded-full" /> : <Check size={20} />}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex justify-between items-center group cursor-pointer" onClick={() => setIsEditing(true)}>
                                    <span className="text-lg font-bold text-white tracking-tight">{profile?.full_name || 'Set Name'}</span>
                                    <button className="text-[10px] text-neutral-500 font-black uppercase tracking-widest group-hover:text-green-500 transition-colors">Edit</button>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                            <button
                                onClick={signOut}
                                className="w-full flex items-center justify-center gap-3 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded-2xl transition-all font-black uppercase tracking-widest text-[10px]"
                            >
                                <LogOut size={16} />
                                Log Out
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-neutral-950 border-t border-neutral-800/50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 uppercase font-bold">
                        {profile?.full_name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-neutral-400 truncate">{profile?.role?.toUpperCase()} ACCOUNT</p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
