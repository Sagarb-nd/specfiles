import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { of, Subscription, throwError, Observable } from 'rxjs';
import { RequestDataTransferNewComponent } from './request-data-transfer-new.component';
import { TenantsService } from '../../../../../../nd-authentication/tenant/tenants.service';
import { GLOBAL_SETTINGS } from 'src/app/configs/CONSTANTS';

describe('RequestDataTransferNewComponent', () => {
  let component: RequestDataTransferNewComponent;
  let fixture: ComponentFixture<RequestDataTransferNewComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    const tenantsServiceSpy = jasmine.createSpyObj('TenantsService', [], { selectedTenantID$: of('777') });

    await TestBed.configureTestingModule({
      imports: [
        RequestDataTransferNewComponent,
        HttpClientTestingModule,
        FormsModule
      ],
      providers: [
        { provide: TenantsService, useValue: tenantsServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RequestDataTransferNewComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    // Provide base url to avoid undefined in request
    (GLOBAL_SETTINGS as { driveriOneBaseUrl?: string }).driveriOneBaseUrl = 'http://base-url';
    // Global stub to avoid real HTTP in tests that don't explicitly spy
    type ComponentWithPrivate = typeof component & { searchDrivers: (text: string) => Observable<unknown> };
    spyOn(component as ComponentWithPrivate, 'searchDrivers').and.returnValue(of([]));
  });

  afterEach(() => httpMock.verify());

  it('should create', () => { expect(component).toBeTruthy(); });

  it('should initialize with default form state', () => {
    expect(component.startDate).toBeUndefined();
    expect(component.endDate).toBeUndefined();
    expect(component.selectedDrivers.size).toBe(0);
    expect(component.transferMethod).toBe('');
    expect(component.comment).toBe('');
    expect(component.testRequest).toBeTrue();
  });

  it('should load drivers first time visible (searchDrivers called at least once)', () => {
    component.ngOnInit();
    type ComponentWithPrivate = typeof component & { searchDrivers: jasmine.Spy };
    const searchSpy = (component as ComponentWithPrivate).searchDrivers.and.returnValue(of([ { id: '5', name: 'A B', email: 'a@b.com' } ]));
    const sub = component.drivers$.subscribe(() => {
      // list may be empty on initial emission before spy wiring; rely on spy call count instead
    });
    component.visible = true;
    component.ngOnChanges({
      visible: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true }
    });
    expect(searchSpy.calls.count()).toBeGreaterThanOrEqual(1);
    sub.unsubscribe();
  });

  it('should not trigger additional load on subsequent visibility changes', () => {
    component.ngOnInit();
    type ComponentWithPrivate = typeof component & { searchDrivers: jasmine.Spy };
    const searchSpy = (component as ComponentWithPrivate).searchDrivers.and.returnValue(of([]));
    const sub = component.drivers$.subscribe();
    component.visible = true;
    component.ngOnChanges({
      visible: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true }
    });
    const firstLoadCalls = searchSpy.calls.count();
    component.ngOnChanges({
      visible: { currentValue: true, previousValue: true, firstChange: false, isFirstChange: () => false }
    });
    expect(searchSpy.calls.count()).toBe(firstLoadCalls); // no increment
    sub.unsubscribe();
  });

  it('should validate form (isFormValid) properly', () => {
    expect(component.isFormValid).toBeFalse();
    component.startDate = new Date();
    component.endDate = new Date();
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('10');
    expect(component.isFormValid).toBeTrue();
  });

  it('should select / deselect driver', () => {
    component.onDriverSelectionChange('99', true);
    expect(component.isDriverSelected('99')).toBeTrue();
    component.onDriverSelectionChange('99', false);
    expect(component.isDriverSelected('99')).toBeFalse();
  });

  it('should select all filtered drivers then clear them', () => {
    const filtered = [ { id: '1', name: 'D1' }, { id: '2', name: 'D2' } ];
    component.onSelectAllDrivers(true, filtered);
    expect(component.isAllDriversSelected(filtered)).toBeTrue();
    component.onSelectAllDrivers(false, filtered);
    expect(component.isAllDriversSelected(filtered)).toBeFalse();
  });

  it('should handle search text changes and filtering', () => {
    component.ngOnInit();
    type ComponentWithPrivate = typeof component & { searchDrivers: jasmine.Spy };
    (component as ComponentWithPrivate).searchDrivers.and.returnValue(of([
      { id: '5', name: 'Alpha Beta', email: 'a@b.com' },
      { id: '6', name: 'Gamma Delta', email: 'g@d.com' }
    ]));
    component.visible = true;
    component.ngOnChanges({ visible: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    const subDrivers = component.drivers$.subscribe();
    component.searchText = 'alp';
    component.onSearchTextChange();
    let received: { id: string; name: string; email?: string }[] = [];
    const subFiltered: Subscription = component.filteredDrivers$.subscribe(list => {
      received = list;
    });
    expect(received.length).toBe(1);
    expect(received[0].name).toContain('Alpha');
    subFiltered.unsubscribe();
    subDrivers.unsubscribe();
  });

  it('should clear search', () => {
    component.searchText = 'something';
    component.clearSearch();
    expect(component.searchText).toBe('');
  });

  it('trackByDriverId returns id', () => {
    expect(component.trackByDriverId(0, { id: '5', name: 'X' })).toBe('5');
  });

  it('getNoDriversFound returns true when not loading and filtered empty', () => {
    expect(component.getNoDriversFound(false, [])).toBeTrue();
    expect(component.getNoDriversFound(true, [])).toBeFalse();
  });

  it('getNoDriversFound returns false when drivers present', () => {
    expect(component.getNoDriversFound(false, [{ id: '1', name: 'X' }])).toBeFalse();
  });

  it('prepareBulkShare converts selected driver IDs to numbers and provides defaults', () => {
    component.startDate = new Date('2025-01-01T00:00:00Z');
    component.endDate = new Date('2025-01-02T00:00:00Z');
    component.transferMethod = ''; // will fallback to EMAIL
    component.comment = '';
    component.selectedDrivers.add('12');
    component.selectedDrivers.add('abc'); // invalid numeric -> excluded
    type ComponentWithPrivate = { prepareBulkShare: () => { transferMode: string; driverIds: number[]; comment: string } };
    const reqBody = (component as unknown as ComponentWithPrivate).prepareBulkShare();
    expect(reqBody.transferMode).toBe('EMAIL');
    expect(reqBody.driverIds).toEqual([12]);
    expect(reqBody.comment).toBe('HOS logs transfer');
  });

  it('prepareBulkShare retains provided transferMethod and comment', () => {
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.comment = 'Custom';
    component.selectedDrivers.add('5');
    type ComponentWithPrivate = { prepareBulkShare: () => { transferMode: string; driverIds: number[]; comment: string } };
    const reqBody = (component as unknown as ComponentWithPrivate).prepareBulkShare();
    expect(reqBody.transferMode).toBe('EMAIL');
    expect(reqBody.comment).toBe('Custom');
  });

  it('validateRange should enforce chronological order', () => {
    const a = new Date('2025-01-01T00:00:00Z');
    const b = new Date('2025-01-02T00:00:00Z');
    type ComponentWithPrivate = { validateRange: (start: Date, end: Date) => boolean };
    expect((component as unknown as ComponentWithPrivate).validateRange(a, b)).toBeTrue();
    expect((component as unknown as ComponentWithPrivate).validateRange(b, a)).toBeFalse();
  });

  it('validate() should fail when start date missing', () => {
    component.endDate = new Date();
    component.selectedDrivers.add('1');
    component.transferMethod = 'EMAIL';
    type ComponentWithPrivate = { prepareBulkShare: jasmine.Spy };
    const prepSpy = spyOn(component as unknown as ComponentWithPrivate, 'prepareBulkShare').and.callThrough();
    component.onSend();
    expect(prepSpy).not.toHaveBeenCalled();
  });

  it('validate() should fail when end date missing', () => {
    component.startDate = new Date();
    component.selectedDrivers.add('1');
    component.transferMethod = 'EMAIL';
    type ComponentWithPrivate = { prepareBulkShare: jasmine.Spy };
    const prepSpy = spyOn(component as unknown as ComponentWithPrivate, 'prepareBulkShare').and.callThrough();
    component.onSend();
    expect(prepSpy).not.toHaveBeenCalled();
  });

  it('validate() should fail when range invalid', () => {
    component.startDate = new Date('2025-01-02');
    component.endDate = new Date('2025-01-01');
    component.selectedDrivers.add('1');
    component.transferMethod = 'EMAIL';
    type ComponentWithPrivate = { prepareBulkShare: jasmine.Spy };
    const prepSpy = spyOn(component as unknown as ComponentWithPrivate, 'prepareBulkShare').and.callThrough();
    component.onSend();
    expect(prepSpy).not.toHaveBeenCalled();
  });

  it('validate() should fail when no drivers selected', () => {
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    type ComponentWithPrivate = { prepareBulkShare: jasmine.Spy };
    const prepSpy = spyOn(component as unknown as ComponentWithPrivate, 'prepareBulkShare').and.callThrough();
    component.onSend();
    expect(prepSpy).not.toHaveBeenCalled();
  });

  it('onSend should not proceed if form invalid', () => {
    type ComponentWithPrivate = { prepareBulkShare: jasmine.Spy };
    spyOn(component as unknown as ComponentWithPrivate, 'prepareBulkShare').and.callThrough();
    component.onSend();
    expect((component as unknown as ComponentWithPrivate).prepareBulkShare).not.toHaveBeenCalled();
  });

  it('onSend should prepare request object and call sendBulkShareRequest when valid', fakeAsync(() => {
    component.ngOnInit();
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('7');
    type ComponentWithPrivate = { sendBulkShareRequest: jasmine.Spy };
    const spySend = spyOn(component as unknown as ComponentWithPrivate, 'sendBulkShareRequest').and.returnValue(of({}));
    let emitted: { success?: boolean; isSubmitting?: boolean; message?: string } | undefined;
    const sub = component.sendResult$.subscribe(r => emitted = r);
    component.onSend();
    tick(300); // debounce
    expect(spySend).toHaveBeenCalledTimes(1);
    const arg = spySend.calls.mostRecent().args[0] as { driverIds: number[]; transferMode: string };
    expect(arg.driverIds).toEqual([7]);
    expect(arg.transferMode).toBe('EMAIL');
    expect(emitted && emitted.success).toBeTrue();
    sub.unsubscribe();
  }));

  it('sendResult$ should emit success and reset on successful request', fakeAsync(() => {
    component.ngOnInit();
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('10');
    type ComponentWithPrivate = { sendBulkShareRequest: jasmine.Spy };
    spyOn(component as unknown as ComponentWithPrivate, 'sendBulkShareRequest').and.returnValue(of({}));
    let emitted: { success?: boolean; isSubmitting?: boolean; message?: string } | undefined;
    const sub = component.sendResult$.subscribe(r => emitted = r);
    component.onSend();
    tick(300);
    expect(emitted).toBeDefined();
    expect(emitted?.success).toBeTrue();
    expect(emitted?.isSubmitting).toBeFalse();
    expect(component.selectedDrivers.size).toBe(0); // reset called
    sub.unsubscribe();
  }));

  it('sendResult$ should emit failure on request error', fakeAsync(() => {
    component.ngOnInit();
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('11');
    type ComponentWithPrivate = { sendBulkShareRequest: jasmine.Spy };
    spyOn(component as unknown as ComponentWithPrivate, 'sendBulkShareRequest').and.returnValue(throwError(() => new Error('boom')));
    let emitted: { success?: boolean; isSubmitting?: boolean; message?: string } | undefined;
    const sub = component.sendResult$.subscribe(r => emitted = r);
    component.onSend();
    tick(300);
    expect(emitted).toBeDefined();
    expect(emitted?.success).toBeFalse();
    expect(emitted?.message).toContain('Failed');
    sub.unsubscribe();
  }));

  it('should debounce multiple rapid onSend calls (only last processed)', fakeAsync(() => {
    component.ngOnInit();
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('12');
    type ComponentWithPrivate = { sendBulkShareRequest: jasmine.Spy };
    const spySend = spyOn(component as unknown as ComponentWithPrivate, 'sendBulkShareRequest').and.returnValue(of({}));
    const sub = component.sendResult$.subscribe();
    component.onSend();
    component.onSend();
    component.onSend();
    tick(300);
    expect(spySend).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  }));

  it('should short-circuit onSend when isSubmitting already true', () => {
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('20');
    component.isSubmitting = true; // simulate in-progress request
    type ComponentWithPrivate = { prepareBulkShare: jasmine.Spy; sendBulkShareRequest: jasmine.Spy };
    const prepSpy = spyOn(component as unknown as ComponentWithPrivate, 'prepareBulkShare').and.callThrough();
    const sendSpy = spyOn(component as unknown as ComponentWithPrivate, 'sendBulkShareRequest').and.callThrough();
    component.onSend();
    expect(prepSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('filterDrivers should match by email', () => {
    const list = [ { id: '1', name: 'AAA', email: 'test@example.com' }, { id: '2', name: 'BBB', email: 'other@sample.com' } ];
    type ComponentWithPrivate = { filterDrivers: (list: { id: string; name: string; email?: string }[], text: string) => { id: string; name: string; email?: string }[] };
    const res = (component as unknown as ComponentWithPrivate).filterDrivers(list, 'example');
    expect(res.length).toBe(1);
    expect(res[0].email).toContain('example');
  });

  it('distinctUntilChanged prevents identical request objects from multiple rapid sends', fakeAsync(() => {
    component.ngOnInit();
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('30');
    type ComponentWithPrivate = { sendBulkShareRequest: jasmine.Spy };
    const spySend = spyOn(component as unknown as ComponentWithPrivate, 'sendBulkShareRequest').and.returnValue(of({}));
    const sub = component.sendResult$.subscribe();
    component.onSend();
    component.onSend(); // identical request should be filtered out by distinctUntilChanged
    tick(300);
    expect(spySend).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  }));

  it('onBackdropClick emits closeDialog', () => {
    spyOn(component.closeDialog, 'emit');
    component.onBackdropClick();
    expect(component.closeDialog.emit).toHaveBeenCalled();
  });

  it('send button should be disabled when form invalid and enabled when valid', () => {
    component.visible = true;
    fixture.detectChanges();
    const sendBtnBefore = fixture.nativeElement.querySelector('.button4');
    expect(sendBtnBefore.classList.contains('disabled')).toBeTrue();
    // make form valid
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('100');
    fixture.detectChanges();
    const sendBtnAfter = fixture.nativeElement.querySelector('.button4');
    expect(component.isFormValid).toBeTrue();
    expect(sendBtnAfter.classList.contains('disabled')).toBeFalse();
    expect(sendBtnAfter.classList.contains('form-valid')).toBeTrue();
  });

  it('clicking send button triggers onSend and sets isSubmitting state until completion', fakeAsync(() => {
    // Override global stub with specific spy ensuring no real HTTP
    type ComponentWithPrivate = { searchDrivers: jasmine.Spy; sendBulkShareRequest: jasmine.Spy };
    (component as unknown as ComponentWithPrivate).searchDrivers.and.returnValue(of([]));
    component.visible = true;
    component.ngOnInit();
    component.ngOnChanges({ visible: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('200');
    let resolveFn: () => void = () => {};
    const controlled$ = new Observable(observer => { resolveFn = () => { observer.next({}); observer.complete(); }; });
    spyOn(component as unknown as ComponentWithPrivate, 'sendBulkShareRequest').and.returnValue(controlled$);
    fixture.detectChanges();
    const sendBtn = fixture.nativeElement.querySelector('.button4');
    expect(sendBtn).toBeTruthy();
    sendBtn.click();
    tick(300); // debounce
    expect(component.isSubmitting).toBeTrue();
    // finish request
    resolveFn();
    tick();
    expect(component.isSubmitting).toBeFalse();
  }));

  it('filterDrivers should return all when searchText is empty or only whitespace', () => {
    interface ComponentWithPrivate { filterDrivers: (list: unknown[], text: string) => unknown[] }
    const list = [{ id: '1', name: 'Driver One', email: 'one@test.com' }, { id: '2', name: 'Driver Two' }];
    expect((component as unknown as ComponentWithPrivate).filterDrivers(list, '').length).toBe(2);
    expect((component as unknown as ComponentWithPrivate).filterDrivers(list, '   ').length).toBe(2);
  });

  it('filterDrivers should match driver without email when email is undefined', () => {
    interface ComponentWithPrivate { filterDrivers: (list: unknown[], text: string) => unknown[] }
    const list = [{ id: '1', name: 'NoEmailDriver' }];
    const result = (component as unknown as ComponentWithPrivate).filterDrivers(list, 'noemail');
    expect(result.length).toBe(1);
  });

  it('prepareBulkShare should throw error when startDate is undefined', () => {
    interface ComponentWithPrivate { prepareBulkShare: () => unknown }
    component.endDate = new Date('2025-01-02');
    component.selectedDrivers.add('5');
    expect(() => (component as unknown as ComponentWithPrivate).prepareBulkShare()).toThrowError('Start date and end date are required');
  });

  it('prepareBulkShare should throw error when endDate is undefined', () => {
    interface ComponentWithPrivate { prepareBulkShare: () => unknown }
    component.startDate = new Date('2025-01-01');
    component.selectedDrivers.add('5');
    expect(() => (component as unknown as ComponentWithPrivate).prepareBulkShare()).toThrowError('Start date and end date are required');
  });

  it('prepareBulkShare should filter out invalid numeric driver IDs (NaN)', () => {
    interface ComponentWithPrivate { prepareBulkShare: () => { driverIds: number[] } }
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.selectedDrivers.add('123');
    component.selectedDrivers.add('notanumber');
    component.selectedDrivers.add('456abc'); // parseInt('456abc', 10) = 456
    const reqBody = (component as unknown as ComponentWithPrivate).prepareBulkShare();
    expect(reqBody.driverIds).toEqual([123, 456]);
  });

  it('sendResult$ should prevent submission when isSubmitting is already true', fakeAsync(() => {
    interface ComponentWithPrivate { 
      sendBulkShareRequest: (body: unknown) => Observable<unknown>;
      prepareBulkShare: () => { startTime: number; endTime: number; transferMode: string; comment: string; driverIds: number[]; subTenantIds: number[]; testRequest: boolean };
    }
    component.ngOnInit();
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-02');
    component.transferMethod = 'EMAIL';
    component.selectedDrivers.add('8');
    const sendSpy = spyOn(component as unknown as ComponentWithPrivate, 'sendBulkShareRequest').and.returnValue(of({}));
    let emitted: { success?: boolean; message?: string } | undefined;
    const sub = component.sendResult$.subscribe(r => emitted = r);
    component.isSubmitting = true; // Simulate request in progress
    component['sendRequestSubject'].next((component as unknown as ComponentWithPrivate).prepareBulkShare());
    tick(300);
    expect(emitted?.success).toBeFalse();
    expect(emitted?.message).toContain('already in progress');
    expect(sendSpy).not.toHaveBeenCalled();
    sub.unsubscribe();
  }));

  it('isAllDriversSelected should return false when filtered list is empty', () => {
    expect(component.isAllDriversSelected([])).toBeFalse();
  });

  it('validateRange should return false when either date is undefined', () => {
    interface ComponentWithPrivate { validateRange: (start: Date | undefined, end: Date | undefined) => boolean }
    expect((component as unknown as ComponentWithPrivate).validateRange(undefined, new Date())).toBeFalse();
    expect((component as unknown as ComponentWithPrivate).validateRange(new Date(), undefined)).toBeFalse();
    expect((component as unknown as ComponentWithPrivate).validateRange(undefined, undefined)).toBeFalse();
  });

  it('reset should clear all form fields and selected drivers', () => {
    interface ComponentWithPrivate { reset: () => void }
    component.startDate = new Date();
    component.endDate = new Date();
    component.transferMethod = 'EMAIL';
    component.comment = 'Test comment';
    component.testRequest = false;
    component.selectedDrivers.add('50');
    component.searchText = 'test';
    (component as unknown as ComponentWithPrivate).reset();
    expect(component.startDate).toBeUndefined();
    expect(component.endDate).toBeUndefined();
    expect(component.transferMethod).toBe('');
    expect(component.comment).toBe('');
    expect(component.testRequest).toBeTrue();
    expect(component.selectedDrivers.size).toBe(0);
    expect(component.searchText).toBe('');
  });
});
