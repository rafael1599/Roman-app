/**
 * Fetches and parses a CSV file from the given URL.
 */
export const fetchAndParseCSV = async <T = any>(url: string): Promise<T[]> => {
  try {
    const { default: Papa } = await import('papaparse');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV from ${url}: ${response.statusText}`);
    }
    const csvText = await response.text();

    return new Promise<T[]>((resolve, reject) => {
      Papa.parse<T>(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
          resolve(results.data);
        },
        error: (error: Error) => {
          reject(error);
        },
      });
    });
  } catch (error) {
    console.error(`Error loading CSV from ${url}:`, error);
    throw error;
  }
};
