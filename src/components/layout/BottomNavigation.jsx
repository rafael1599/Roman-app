import React from 'react';
import { Box, Layers, Scan } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink
        to={to}
        className={({ isActive }) => twMerge(
            "flex flex-col items-center justify-center flex-1 h-full transition-colors",
            isActive ? "text-green-400" : "text-neutral-500 hover:text-neutral-300"
        )}
    >
        <Icon className="w-6 h-6 mb-1" />
        <span className="text-xs font-medium tracking-wide">{label}</span>
    </NavLink>
);

export const BottomNavigation = () => {
    return (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-neutral-950 border-t border-neutral-800 flex items-center justify-around z-50 pb-safe">
            <NavItem to="/" icon={Box} label="LUDLOW" />
            <NavItem to="/ats" icon={Layers} label="ATS" />
            <NavItem to="/picking" icon={Scan} label="PICKING" />
        </div>
    );
};
