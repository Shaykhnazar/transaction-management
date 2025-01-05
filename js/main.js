import { DataManager } from './DataManager.js';
import { FileUploader } from './FileUploader.js';

document.addEventListener('DOMContentLoaded', function() {
    const app = {
        dataManager: new DataManager(),
        fileUploader: new FileUploader(
          document.querySelector('.drop-area'),
          document.getElementById('fileInput'),
          () => app.dataManager.refreshAllData(true)
        )
    };

    // Initial data load
    app.dataManager.refreshAllData();
});

