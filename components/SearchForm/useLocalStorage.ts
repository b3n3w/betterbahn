import { useEffect, useState } from "react";

export const useLocalStorage = <T>(key: string, initialValue: T) => {
	const [value, setValueInternal] = useState(() => initialValue);

	const initialize = () => {
		if (typeof window === "undefined") {
			return initialValue;
		}

		const stringified = window.localStorage.getItem(key);

		if (stringified === null) {
			return initialValue;
		}

		return JSON.parse(stringified) as T;
	};

	// prevents hydration error so that state is only initialized after server is defined
	useEffect(() => {
		setValueInternal(initialize());
	}, []);

	const setValueExternal = (newValue: T) => {
		setValueInternal(newValue);
		window.localStorage.setItem(key, JSON.stringify(newValue));
	};

	return [value, setValueExternal] as const;
};
