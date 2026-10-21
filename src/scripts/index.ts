/**
 * The main source file. Does only include {@link MainController}, which does the actual work.
 */

import { MainController, ExportController, ImportController } from "./internal"

// @ts-ignore
window.mainController = MainController.instance
// @ts-ignore
window.exportController = ExportController.instance
// @ts-ignore
window.importController = ImportController.instance

