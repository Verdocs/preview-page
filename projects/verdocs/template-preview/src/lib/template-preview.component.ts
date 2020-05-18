import {
  Component,
  OnInit,
  AfterViewChecked,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  Inject,
  PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormGroup, Validators, FormBuilder } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { VerdocsStateService, VerdocsTokenObjectService } from '@verdocs/tokens';
import { TemplatesService, getRGBA, getRGB } from '@verdocs/sdk';
import { PageService } from '@verdocs/essentials';
import { VerdocsHeaderService } from '@verdocs/header';
import { EventTrackerService } from '@verdocs/event-tracker';
import { findIndex } from 'lodash';

import { HeaderService } from '../../core/services/header.service';
import { RouterService } from '../../core/services/router.service';
import { Broadcast } from '../../core/services/broadcast';
import { SSRService } from '../../shared/services/ssr.service';

import { EmailValidator } from '../../core/validators/email.validator';
import { CreateEnvelopeService, FixedDialogRef } from '../../shared/components/create-envelope';
import { environment } from 'environments/environment';

@Component({
  selector: 'app-template-preview',
  templateUrl: './template-preview.component.html',
  styleUrls: ['./tempalte-preview.component.scss']
})
export class TemplatePreviewComponent implements OnInit, AfterViewChecked, OnDestroy {
  public loading = true;
  public template: any;
  public templateId: string;
  public templateDoc: any;
  public templatePdf: any;
  public templateOwnerInfo: any = null;
  public isTemplateOwner = false;
  public pdfUrl: any;
  public currentProfile: any = null;
  public pdfPages = [];
  public totalPages: any[];
  public pageRendered: number[] = [];
  public bodyHeight = '100vh';
  public fields: any[];
  public roles: any[] = [];
  public roleFormGroup: FormGroup;
  public selectedRole: string = null;
  public mode: 'preview' | 'liveview' = 'preview';
  public hasCreateDialog = false;
  public initialLoad = true;
  public isInProgress = (this.totalPages && (this.pageRendered.length < this.totalPages.length)) || !this.totalPages;
  public isBrowser = false;
  public thumbnail: any;
  public footerBottom = '0px';

  // rAngular settings
  public overrideLauncherRight = 20;
  public overrideLauncherTop = 56;
  public overrideProfileRight = 20;
  public overrideProfileTop = 56;

  @ViewChild('pdfDoc', { static: false }) pdfDoc: ElementRef;

  private _canSend: boolean = null;
  private _canClickCreate: boolean = null;
  private _routeDataSubscription = new Subscription();
  private _createEnvelopeDialog: FixedDialogRef;
  private _fromPage: string = null;
  private _templateRequestSubscription = new Subscription();
  private _createButtonToggleSubscription = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private templatesService: TemplatesService,
    private headerService: HeaderService,
    private routerService: RouterService,
    private verdocsHeaderService: VerdocsHeaderService,
    private vTokenStateService: VerdocsStateService,
    private vTokenObjectService: VerdocsTokenObjectService,
    private ssrService: SSRService,
    private fb: FormBuilder,
    private createEnvelope: CreateEnvelopeService,
    private broadcast: Broadcast,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
    private eventTracker: EventTrackerService,
    private pageService: PageService,
    @Inject(PLATFORM_ID) private platform
  ) { }

  async ngOnInit() {
    this.headerService.modeSubject.next(this.mode);
    this._fromPage = this.routerService.getPreviousUrl();
    if (!!this._fromPage || this._fromPage != undefined) {
      this.vTokenStateService.storeOtherCookie('rF-live', this._fromPage);
    }
    this.currentProfile = this.vTokenObjectService.getProfile();
    this._routeDataSubscription = this.route.data.subscribe(async data => {
      if (data) {
        this.template = data.template;
        this.verdocsHeaderService.templateSubject.next(this.template);
        this.templateId = this.template.id;
        this.eventTracker.createEvent({
          category: 'document',
          action: 'document preview',
          label: `document id: ${this.templateId}`
        })
        this.prepareRoles(this.template);
        this.buildRoleFormGroup();
        this.templateDoc = (await this.templatesService.getAllTemplateDocuments(this.templateId))[0];
        this.templatePdf = await this.templatesService.getTemplateDocument(this.templateId, this.templateDoc);
        this.templateOwnerInfo = await this.templatesService.getTemplateOwnerInfo(this.templateId);
        this.pageService.setTitleAndRecord(`${this.template.name} - Preview`, 'document-preview');
        this.pageService.setCanonicalUrl({ rel: 'canonical', href: environment.frontend_url + `/document/${this.template.id}` });
        this.pageService.setDescriptionMeta(this.template['description']);
        this.pageService.setRobotMeta(this.pageService.robotEnum().Index, this.pageService.robotEnum().Follow);
        this.updateMetaTags(this.template);
        const pdf_url = URL.createObjectURL(this.templatePdf);
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(pdf_url);
        this.totalPages = new Array(this.template['pages'].length);
        this.prepareFields();
        if (this._fromPage.match(/\/builder/)) {
          this.verdocsHeaderService.createToggleSubscription.next(true);
        }
      }
    });
    this._templateRequestSubscription = this.verdocsHeaderService.templateDetailToggleSubject.subscribe(status => {
      if (status = true) {
        this.verdocsHeaderService.templateSubject.next(this.template);
      }
    });

    this._createButtonToggleSubscription = this.verdocsHeaderService.createToggleSubscription.subscribe(status => {
      if (status) {
        if (!this.hasCreateDialog) {
          this.openCreateEnvelopeDialog(true);
        } else {
          if (!this.currentProfile) {
            this._createEnvelopeDialog.close();
          }
          this.openCreateEnvelopeDialog(true);
        }
      }
    });
    this.onResize();
    setTimeout(() => {
      this.showIntercom(false)
    }, 1000);
    this.isBrowser = isPlatformBrowser(this.platform);
  }

  ngAfterViewChecked() {
    if (this.pdfPages && this.totalPages && this.pdfPages.length === this.totalPages.length) {
      this.broadcast.broadcast('pdfUpdate', true);
    }
    this.footerBottom = `calc(100vh - ${window.innerHeight}px)`
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    this._routeDataSubscription.unsubscribe();
    this._templateRequestSubscription.unsubscribe();
    this._createButtonToggleSubscription.unsubscribe();
    this.showIntercom(true);
  }

  updateMetaTags(template) {
    const title = 'Verdocs - ' + template.name;
    const description = template['description'] || 'Sign up for free and start transitioning your business to a full digital ecosystem.';
    let image = null;
    if (template['thumbnail_base64']) {
      image = 'data:image/png;base64, ' + template['thumbnail_base64']
    }
    this.pageService.setOpenGraphMeta('website', title, description, image, null)
  }

  roleTracking(index, item) {
    return index;
  }

  numTracking(index, item) {
    return index;
  }

  onPageRendered(event) {
    if (isPlatformBrowser(this.platform)) {

      if (this.pageRendered.indexOf(event.detail.pageNumber) === -1) {
        this.pageRendered.push(event.detail.pageNumber);
        this.checkInProgress();
      }
      const index = event.detail.pageNumber - 1;
      const pdfPagesDOM = this.pdfDoc['pdfContainer']['nativeElement'].children[0].children;
      const height = pdfPagesDOM[index].offsetHeight;
      const width = pdfPagesDOM[index].offsetWidth;
      const originalHeight = this.shouldAlternateSize(event.detail.viewport.rotation) ? event.detail.viewport.viewBox[2] - event.detail.viewport.viewBox[0] : event.detail.viewport.viewBox[3] - event.detail.viewport.viewBox[1];
      const originalWidth = this.shouldAlternateSize(event.detail.viewport.rotation) ? event.detail.viewport.viewBox[3] - event.detail.viewport.viewBox[1] : event.detail.viewport.viewBox[2] - event.detail.viewport.viewBox[0];
      const existingIndex = findIndex(this.pdfPages, { 'pageNumber': event.detail.pageNumber });
      if (existingIndex < 0) {
        this.pdfPages.push({
          'height': height,
          'width': width,
          'originalHeight': originalHeight,
          'originalWidth': originalWidth,
          'xRatio': width / originalWidth,
          'yRatio': height / originalHeight,
          'pageNumber': event.detail.pageNumber
        });
      } else {
        this.pdfPages[existingIndex] = {
          'height': height,
          'width': width,
          'originalHeight': originalHeight,
          'originalWidth': originalWidth,
          'xRatio': width / originalWidth,
          'yRatio': height / originalHeight,
          'pageNumber': event.detail.pageNumber
        }
      }
      if (this.pdfPages && this.totalPages && this.pdfPages.length === this.totalPages.length) {
        this.pdfPages = this.pdfPages.sort((a, b) => a.pageNumber - b.pageNumber);
        this.broadcast.broadcast('pdfUpdate', true);
        this.loading = false;
        if (this.initialLoad === true) {
          if (this.currentProfile) {
            this.initialLoad = false;
          }
        }
      }
    }
  }

  checkInProgress() {
    this.isInProgress = (this.totalPages && (this.pageRendered.length < this.totalPages.length)) || !this.totalPages
  }

  returnToPreviousPage() {
    let fromPage;
    const urlSegment = this.vTokenStateService.getOtherCookie('rF-live');
    if (urlSegment) {
      fromPage = decodeURIComponent(urlSegment as string);
      if (fromPage.charAt(0) === '/') {
        fromPage = fromPage.slice(1);
      }
    }
    if (fromPage == undefined || fromPage == null) {
      fromPage = 'dashboard';
    }
    if (fromPage.includes('view/sign') || fromPage.includes('view/live') || fromPage.includes('review') || fromPage.includes('document/' + this.template.id)) {
      fromPage = 'dashboard';
    }
    this.vTokenStateService.removeRCookie('rF-live');
    const navigateTimer = setTimeout(() => {
      this.router.navigateByUrl(fromPage);
      clearTimeout(navigateTimer);
    }, 300)
  }

  shouldAlternateSize(rotation) {
    if (rotation === 0 || rotation % 180 === 0) {
      return false;
    } else {
      return true;
    }
  }
  onResize() {
    if ((isPlatformBrowser(this.platform))) {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      this.bodyHeight = "calc(var(--vh, 1vh) * 100)";
    }
  }

  buildRoleFormGroup() {
    const roleFormGroup: any = {}
    this.roles.forEach((role, index) => {
      const roleCopy = { ...role };
      roleCopy['content_editable'] = false;
      roleCopy['readOnly'] = !!roleCopy.email;
      roleCopy['backgroundColor'] = this.getRGB(index);
      roleFormGroup[roleCopy.name] = this.fb.group({
        type: [roleCopy.type],
        name: [roleCopy.name],
        full_name: [{ value: roleCopy.full_name ? roleCopy.full_name : '', disabled: !!roleCopy.full_name }, [Validators.required]],
        email: [roleCopy.email ? roleCopy.email : '', [Validators.required, EmailValidator.MatchEmail]],
        sequence: [roleCopy.sequence],
        delegator: [roleCopy.delegator ? true : false],
        message: [roleCopy.message ? roleCopy.message : '']
      });
    });
    this.roleFormGroup = new FormGroup(roleFormGroup);
  }

  prepareRoles(template) {
    let roles = []
    if (template['roles'] && template['roles'].length > 0) {
      roles = template['roles'];
    }
    this.roles = roles.sort((a, b) => {
      if (a.sequence === b.sequence) {
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      }
      return b.sequence > a.sequence ? -1 : b.sequence < a.sequence ? 1 : 0;
    });
  }

  prepareFields() {
    let fields = [];
    const _fields = [];
    for (let x = 0; x < this.roles.length; x++) {
      this.roles[x]['fields'] = this.sortFields(this.roles[x]['fields']);
      for (const field of this.roles[x]['fields']) {
        field['rgba'] = getRGBA(x);
      }
      fields = fields.concat(this.roles[x]['fields']);
    }

    for (const field of fields) {
      field.recipient_role = field.role_name;
      _fields.push({
        name: field.name,
        value: ''
      });
    }
    this.fields = this.organizeFields(fields);
  }

  organizeFields(fields: any[]) {
    const tempFields: any[] = [];
    for (let i = 0; i < fields.length; i++) {
      const pageIndex: number = fields[i]['page'] || fields[i]['page_sequence'];
      if (tempFields[pageIndex] == null) {
        tempFields[pageIndex] = [];
      }
    }
    for (let i = 0; i < fields.length; i++) {
      const pageIndex: number = fields[i]['page'] || fields[i]['page_sequence'];
      const constructedFields = this.buildFields(fields[i], i);
      if (constructedFields instanceof Array) {
        tempFields[pageIndex] = tempFields[pageIndex].concat(constructedFields)
      } else {
        tempFields[pageIndex].push(constructedFields)
      }
    }
    return this.sortFields(tempFields);
  }

  sortFields(fields) {
    for (let i = 0; i < fields.length; i++) {
      if (fields[i] != null && fields[i].length > 1) {
        fields[i].sort((a, b) => {
          let setting = 'settings';
          if (!a[setting]) {
            setting = 'setting';
          }
          if (a[setting].y === b[setting].y || this.canBeSameRow(a, b)) {
            const ax = a[setting].x, bx = b[setting].x;
            return ax < bx ? -1 : ax > bx ? 1 : 0;
          }
          return b[setting].y - a[setting].y
        })
      }
    }
    return fields;
  }

  buildFields(field, i) {
    let fields = [];
    let setting = 'setting';
    if (!field[setting]) {
      setting = 'settings';
    }
    if (field && field[setting] && field[setting].options && field[setting].options.length > 0 &&
      (field.type === 'checkbox_group' || field.type === 'radio_button_group')) {
      for (const option of field[setting].options) {
        const fieldCopy = { setting: {} };
        fieldCopy[setting]['x'] = option.x;
        fieldCopy[setting]['y'] = option.y;
        fieldCopy['page_sequence'] = field['page_sequence'];
        fieldCopy['type'] = field['type'];
        fieldCopy['rgba'] = field['rgba'];
        fieldCopy['name'] = field['name'];
        fieldCopy['role_name'] = field['role_name'] || field['recipient_name'];
        fieldCopy['required'] = field['required'];
        if (field['type'] === 'checkbox_group') {
          fieldCopy['setting']['checked'] = option.checked;
        } else {
          fieldCopy['setting']['selected'] = option.selected;
        }
        fieldCopy['originalIndex'] = i;
        fieldCopy['optionId'] = option.id;
        fields.push(fieldCopy);
      }
      return fields;
    } else {
      return field;
    }
  }

  canBeSameRow(a, b) {
    let setting = 'setting';
    if (!a[setting]) {
      setting = 'settings';
    }
    const aHeight = this.getHeight(a);
    const bHeight = this.getHeight(b);
    const aBottom = a[setting].y;
    const bBottom = b[setting].y;
    let baseHeight;
    if (aBottom < bBottom) {
      baseHeight = aHeight;
    } else {
      baseHeight = bHeight;
    }
    const fillerHeight = Math.abs(aBottom - bBottom);
    return fillerHeight < baseHeight;
  }

  getHeight(field) {
    let setting = 'setting';
    if (!field[setting]) {
      setting = 'settings';
    }
    let height = 0;
    switch (field.type) {
      case 'signature':
      case 'initial':
        height = 36;
        break;
      case 'checkbox':
        height = 13.5;
        break;
      case 'attachment':
      case 'payment':
        height = 24;
        break;
      default:
        height = field[setting]['height'] || 0;
        break;
    }
    return height;
  }

  getWrapperStyling(i) {
    if (this.pdfPages && this.pdfPages.length > 0 && this.pdfPages[i]) {
      return {
        margin: '10px auto 0',
        height: this.pdfPages[i].height + 'px',
        width: this.pdfPages[i].width + 'px'
      }
    }
  }

  getRGB(index) {
    return getRGB(getRGBA(index));
  }

  tooltipText(role) {
    let label = role['name'];
    if (role['email']) {
      label = `${role['full_name']}\n\r${role['email']}`;
    }
    if (role['full_name'] && !role['email']) {
      label = role['full_name'];
    }
    if (this.roleFormGroup && this.roleFormGroup.controls[role.name]) {
      const newRole = this.roleFormGroup.controls[role.name].value;
      if (newRole.email && newRole.full_name) {
        label = `${newRole.full_name}\n\r${newRole.email}`;
      }
    }
    return label;
  }
  roleInitial(role) {
    if (role) {
      if (role.full_name) {
        const nameArray = role.full_name.split(' ');
        return nameArray.length > 1 ? nameArray[0].charAt(0) + nameArray[nameArray.length - 1].charAt(0) : nameArray[0].charAt(0);
      } else if (this.roleFormGroup && this.roleFormGroup.controls[role.name] && this.roleFormGroup.controls[role.name]['controls']['full_name'].value) {
        const nameArray = this.roleFormGroup.controls[role.name]['controls']['full_name'].value.split(' ');
        return nameArray.length > 1 ? nameArray[0].charAt(0) + nameArray[nameArray.length - 1].charAt(0) : nameArray[0].charAt(0);
      }
      const nameArray = role.name.split(' ');
      return nameArray.length > 1 ? nameArray[0].charAt(0) + nameArray[nameArray.length - 1].charAt(0) : nameArray[0].charAt(0);
    }
  }

  selectRole(role_name, event) {
    if (event && event.target && event.target.className === 'template__overlay') {
      this.selectedRole = null;
      return;
    }
    this.selectedRole = role_name;
  }

  canClickCreate() {
    if (typeof (this._canClickCreate) !== 'boolean') {
      if (!this.currentProfile) {
        this._canClickCreate = this.template ? this.template.is_public : false;
      } else {
        this._canClickCreate = this.canSendEnvelope();
      }
    }
    return this._canClickCreate;
  }

  canSendEnvelope() {
    if (typeof (this._canSend) !== 'boolean' && this.templatesService) {
      this._canSend = this.templatesService.canSendEnvelope(this.template);
    }
    return this._canSend;
  }

  openCreateEnvelopeDialog(manual?: boolean) {
    if (this.canClickCreate()) {

      let width = 380;
      let marginRight = 24;
      if ((isPlatformBrowser(this.platform))) {
        if (window.innerWidth && window.innerWidth <= 480) {
          width = window.innerWidth;
          marginRight = 0;
        } else {
          width = 380;
          marginRight = 24;
        }
      }

      this._createEnvelopeDialog = this.createEnvelope.open({
        position: {
          bottom: '0px',
          right: `${marginRight}px`
        },
        width: `${width}px`,
        height: '48px',
        maxHeight: '80vh'
      });
      this.createEnvelope.updateAllPositions(this.createEnvelope.openDialogs);
      this._createEnvelopeDialog._containerInstance.template = this.template;
      this._createEnvelopeDialog._containerInstance._templateSource = this.mode;
      this._createEnvelopeDialog._containerInstance.templateOwnerInfo = this.templateOwnerInfo;
      this._createEnvelopeDialog._containerInstance.isTemplateOwner = this.isTemplateOwner;
      this._createEnvelopeDialog._containerInstance.templateId = this.templateId;
      this._createEnvelopeDialog._containerInstance.currentProfile = this.currentProfile;
      this._createEnvelopeDialog._containerInstance.initializeData();
      if (manual) {
        const timer = setTimeout(() => {
          this._createEnvelopeDialog.expand();
          clearTimeout(timer);
        }, 250);
      }
      this._createEnvelopeDialog.afterClosed().subscribe(() => {
        this.updateHasCreateDialog();
        this.createEnvelope.updateAllPositions(this.createEnvelope.openDialogs);
      })
      this.updateHasCreateDialog();
    }
  }

  updateHasCreateDialog(): void {
    if (this.createEnvelope.openDialogs.length > 0) {
      this.hasCreateDialog = true;
    } else {
      this.hasCreateDialog = false;
    }
  }

  showIntercom(show: boolean) {
    if (this.ssrService.isBrowser()) {
      if (!document.cookie.includes(environment.rForm_cookie_name)) {
        if (!show) {
          document.getElementById('intercom-container').style.display = 'none';
        } else {
          document.getElementById('intercom-container').style.display = 'block';
        }
      }
    }
  }

  getCanSendTooltip() {
    return !this._canClickCreate && !this.canSendEnvelope() ? 'Document cannot be used to create a Verdoc' : '';
  }

  templateActionLabel() {
    return this.isInProgress ? '' : this.mode === 'liveview' ? 'get started' : 'create';
  }
}

