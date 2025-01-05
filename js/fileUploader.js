import { CONFIG } from './config.js'

export class FileUploader {
  constructor(dropArea, fileInput, onSuccess) {
    this.dropArea = dropArea;
    this.fileInput = fileInput;
    this.onSuccess = onSuccess;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    this.initializeDropEvents();
    this.initializeFileInput();
  }

  initializeDropEvents() {
    document.querySelector('.browse-files').addEventListener('click', (e) => {
      e.preventDefault();
      this.fileInput.click();
    });

    // this.fileInput.addEventListener('change', (e) => {
    //   this.handleFiles(this.files);
    // });

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.dropArea.addEventListener(eventName, this.preventDefaults);
      document.body.addEventListener(eventName, this.preventDefaults);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropArea.addEventListener(eventName, () => this.highlight());
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.dropArea.addEventListener(eventName, () => this.unhighlight());
    });

    this.dropArea.addEventListener('drop', (e) => this.handleDrop(e));
  }

  initializeFileInput() {
    this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
  }

  handleDrop(e) {
    const files = e.dataTransfer.files;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(files[0]);
    this.fileInput.files = dataTransfer.files;
    this.handleFiles(files);
  }

  async handleFiles(files) {
    const formData = new FormData();
    formData.append('file', files[0]);

    this.dropArea.classList.add('uploading');

    try {
      const response = await this.uploadFile(formData);
      if (response.success) {
        this.onSuccess();
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      this.dropArea.classList.remove('uploading');
    }
  }

  async uploadFile(formData) {
    const response = await fetch(CONFIG.API_ENDPOINTS.UPLOAD, {
      method: 'POST',
      body: formData
    });
    return response.json();
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  highlight() {
    this.dropArea.classList.add('highlight');
  }

  unhighlight() {
    this.dropArea.classList.remove('highlight');
  }
}
