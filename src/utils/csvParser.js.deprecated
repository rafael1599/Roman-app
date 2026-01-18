import Papa from 'papaparse';

/**
 * Fetches and parses a CSV file from the given URL.
 * @param {string} url - The URL of the CSV file.
 * @returns {Promise<Array>} - A promise that resolves to the parsed data.
 */
export const fetchAndParseCSV = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch CSV from ${url}: ${response.statusText}`);
        }
        const csvText = await response.text();

        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data);
                },
                error: (error) => {
                    reject(error);
                },
            });
        });
    } catch (error) {
        console.error(`Error loading CSV from ${url}:`, error);
        throw error;
    }
};
