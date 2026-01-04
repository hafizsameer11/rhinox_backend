import { type Express } from 'express';
import { type IModule, type ModuleRegistration } from '../types/module.types.js';

/**
 * Module Loader
 * Dynamically loads and registers modules
 */
export class ModuleLoader {
  private app: Express;
  private modules: Map<string, IModule> = new Map();

  constructor(app: Express) {
    this.app = app;
  }

  /**
   * Register a module
   */
  register(registration: ModuleRegistration): void {
    const { module, middleware = [] } = registration;

    if (this.modules.has(module.name)) {
      throw new Error(`Module ${module.name} is already registered`);
    }

    // Apply middleware if provided
    if (middleware.length > 0) {
      this.app.use(module.path, ...middleware);
    }

    // Register routes
    this.app.use(module.path, module.router);

    // Store module
    this.modules.set(module.name, module);

    console.log(`✅ Module registered: ${module.name} at ${module.path}`);
  }

  /**
   * Register multiple modules
   */
  registerMany(registrations: ModuleRegistration[]): void {
    registrations.forEach((registration) => this.register(registration));
  }

  /**
   * Get registered module
   */
  getModule(name: string): IModule | undefined {
    return this.modules.get(name);
  }

  /**
   * Get all registered modules
   */
  getAllModules(): IModule[] {
    return Array.from(this.modules.values());
  }
}

