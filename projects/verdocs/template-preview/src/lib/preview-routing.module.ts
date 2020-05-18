import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { TemplatePreviewComponent } from './preview.component';
import { TemplateResolver } from '../../core/resolvers/template.resolver';

const routes: Routes = [
  {
    path: ':template_id',
    component: TemplatePreviewComponent,
    data: { route: 'preview', lazyTitle: true },
    resolve: {
      template: TemplateResolver
    }
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
  providers: [
    TemplateResolver
  ]
})

export class PreviewRoutingModule { }
