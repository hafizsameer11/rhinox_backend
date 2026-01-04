import { type Router } from 'express';

/**
 * Module Interface
 * Each module must implement this interface
 */
export interface IModule {
  name: string;
  router: Router;
  path: string; // Base path for the module routes (e.g., '/api/auth')
}

/**
 * Module Registration
 */
export interface ModuleRegistration {
  module: IModule;
  middleware?: Array<(req: any, res: any, next: any) => void>;
}

