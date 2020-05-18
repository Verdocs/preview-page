import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { PdfViewerModule } from '@verdocs/pdf-viewer';
import { ProfilesModule } from '@verdocs/profiles';

import { PreviewRoutingModule } from './preview-routing.module';
import { EnvelopeFieldsLiteModule } from '../../shared/components/envelope-fields/envelope-fields-lite.module';
import { FixedDialogModule } from '../../shared/components/create-envelope'

import { TemplatePreviewComponent } from './template-preview.component';


@NgModule({
  declarations: [TemplatePreviewComponent],
  imports: [
  ],
  exports: [TemplatePreviewComponent]
})
export class TemplatePreviewModule { }
