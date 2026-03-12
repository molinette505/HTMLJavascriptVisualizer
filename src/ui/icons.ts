// File purpose: thin wrapper to refresh Lucide icons after dynamic DOM updates.
import { createIcons, icons } from 'lucide';

export const refreshIcons = () => {
    createIcons({ icons });
};
