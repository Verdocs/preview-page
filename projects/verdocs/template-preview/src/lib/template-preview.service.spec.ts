import { TestBed } from '@angular/core/testing';

import { TemplatePreviewService } from './template-preview.service';

describe('TemplatePreviewService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: TemplatePreviewService = TestBed.get(TemplatePreviewService);
    expect(service).toBeTruthy();
  });
});
