import { create } from 'zustand';
import { persist } from 'zustand/middleware';

let systemPurposesJson: any

try {
    systemPurposesJson = require('./../../../../../customization/system-purposes.json');
} catch (error) {
    systemPurposesJson = { Settings: { hiddenPurposeIDs: ['Designer'] } };
}

interface PurposeStore {

    // state
    hiddenPurposeIDs: string[];

    // actions
    toggleHiddenPurposeId: (purposeId: string) => void;

}


export const usePurposeStore = create<PurposeStore>()(
    persist(
        (set) => ({

            // default state
            hiddenPurposeIDs: systemPurposesJson.Settings.hiddenPurposeIDs,

            toggleHiddenPurposeId: (purposeId: string) => {
                set(state => {
                    const hiddenPurposeIDs = state.hiddenPurposeIDs.includes(purposeId)
                        ? state.hiddenPurposeIDs.filter((id) => id !== purposeId)
                        : [...state.hiddenPurposeIDs, purposeId];
                    return {
                        hiddenPurposeIDs,
                    };
                });
            },

        }),
        {
            name: 'app-purpose',
        }),
);