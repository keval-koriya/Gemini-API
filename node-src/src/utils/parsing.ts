export function getNestedValue(obj: any, path: (string | number)[], defaultValue: any = null): any {
    try {
        let current = obj;
        for (const key of path) {
            if (current === undefined || current === null) {
                return defaultValue;
            }
            current = current[key];
        }
        return current !== undefined ? current : defaultValue;
    } catch {
        return defaultValue;
    }
}
