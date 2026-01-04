/**
 * ID Parser Utility
 * Converts string IDs to integers for database queries
 */

/**
 * Parse an ID from string to integer
 * @param id - ID value (string or number)
 * @param fieldName - Name of the field for error messages
 * @returns Parsed integer ID
 * @throws Error if ID is invalid
 */
export function parseId(id: string | number | undefined, fieldName: string = 'ID'): number {
  if (id === undefined || id === null) {
    throw new Error(`${fieldName} is required`);
  }
  
  const parsed = typeof id === 'string' ? parseInt(id, 10) : id;
  
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName} format: must be a positive integer`);
  }
  
  return parsed;
}

/**
 * Parse an optional ID from string to integer
 * @param id - ID value (string or number or undefined)
 * @param fieldName - Name of the field for error messages
 * @returns Parsed integer ID or undefined
 * @throws Error if ID is provided but invalid
 */
export function parseOptionalId(id: string | number | undefined, fieldName: string = 'ID'): number | undefined {
  if (id === undefined || id === null) {
    return undefined;
  }
  
  const parsed = typeof id === 'string' ? parseInt(id, 10) : id;
  
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName} format: must be a positive integer`);
  }
  
  return parsed;
}

