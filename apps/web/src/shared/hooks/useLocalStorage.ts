import type { Dispatch, SetStateAction } from "react";
import { useState, useEffect } from "react";

export function useLocalStorage<T>(
    initialValue: T | (() => T),
    key: string
): [T, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(() => {
        try {
            const item = localStorage.getItem(key);
            if (item !== null) {
                return JSON.parse(item);
            }
        } catch (error) {
            console.warn(`Failed to parse localStorage key "${key}"`, error);
        }

        // Use fallback if nothing in storage or parsing failed
        return typeof initialValue === "function"
            ? (initialValue as () => T)()
            : initialValue;
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn(`Failed to set localStorage key "${key}"`, error);
        }
    }, [key, value]);

    return [value, setValue];
}