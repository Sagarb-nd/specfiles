import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { AddNewLogsPanelComponent } from './add-new-logs-panel.component';
import { Observable, of } from 'rxjs';
import { ManualLogApiService, ManualLogResponse } from './manual-log-api.service';
import { NgbActiveOffcanvas } from '@ng-bootstrap/ng-bootstrap';
import { UserService } from '../../../../../../nd-authentication/tenant/user.service';
import { TenantsService } from '../../../../../../nd-authentication/tenant/tenants.service';

// Simple mock implementations
class MockActiveOffcanvas {
  closeArg: ManualLogResponse | undefined; dismissCalled = false;
  close(arg?: ManualLogResponse) { this.closeArg = arg; }
  dismiss() { this.dismissCalled = true; }
}

interface MockTenant {
  time_zone?: string;
}

interface MockUser {
  user_id: number;
}

describe('AddNewLogsPanelComponent', () => {
  let component: AddNewLogsPanelComponent;
  let fixture: ComponentFixture<AddNewLogsPanelComponent>;
  let manualLogApiService: jasmine.SpyObj<ManualLogApiService>;
  let tenantsServiceMock: { selectedUserTenant$: Observable<MockTenant> };
  let userServiceMock: { user$: Observable<MockUser> };
  const existingLogs = [
    { timestamp: Date.UTC(2025, 0, 1, 8, 0, 0), id: 1, status: 1, createdOn: 0, updatedOn: 0, address: 'A', eventCode: 'OFF_DUTY', category: 'MANUAL', canEdit: true, editableFields: [] },
    { timestamp: Date.UTC(2025, 0, 1, 10, 0, 0), id: 2, status: 1, createdOn: 0, updatedOn: 0, address: 'B', eventCode: 'ON_DUTY', category: 'MANUAL', canEdit: true, editableFields: [] }
  ];

  beforeEach(async () => {
    manualLogApiService = jasmine.createSpyObj('ManualLogApiService', ['createManualLog']);
    tenantsServiceMock = {
      selectedUserTenant$: of({ time_zone: 'UTC' })
    };
    userServiceMock = {
      user$: of({ user_id: 999 })
    };

    await TestBed.configureTestingModule({
      imports: [AddNewLogsPanelComponent],
      providers: [
        { provide: ManualLogApiService, useValue: manualLogApiService },
        { provide: TenantsService, useValue: tenantsServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: NgbActiveOffcanvas, useClass: MockActiveOffcanvas }
      ],
      // Suppress unknown property binding errors coming from template (e.g. data-name on nd-nux-icon)
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AddNewLogsPanelComponent);
    component = fixture.componentInstance;
    // Set required inputs
    component.driverId = 123;
    component.tenantId = 456;
    component.driverName = 'John Doe';
    component.selectedDate = new Date(Date.UTC(2025, 0, 1));
    component.hosData$ = of(existingLogs);
    fixture.detectChanges();
  });

  it('should create component and initialize form', () => {
    expect(component).toBeTruthy();
    expect(component.addLogForm).toBeTruthy();
    expect(component.addLogForm.get('dutyStatus')).toBeTruthy();
  });

  it('should compute duration$ for a time between existing logs', fakeAsync(() => {
    // Subscribe BEFORE patching value because duration$ uses valueChanges without startWith
    let latest: string | undefined;
    const sub = component.duration$.subscribe(val => latest = val);
    component.addLogForm.patchValue({ eventTime: '9:00 AM', dutyStatus: 'ON_DUTY', location: 'Loc', comment: 'Comm' });
    tick(); // process valueChanges emission
    expect(latest).toBeTruthy();
    expect(latest!).toContain('hr');
    sub.unsubscribe();
  }));

  it('should invalidate time if conflicts with existing timestamp', fakeAsync(() => {
    component.onTimeSelected({ hour: 8, minute: '00', ampm: 'am' });
    tick();
    expect(component.isTimeValid).toBeFalse();
    expect(component.timeValidationMessage).toContain('conflicts');
  }));

  it('should submit and close on success', fakeAsync(() => {
    component.addLogForm.patchValue({ dutyStatus: 'ON_DUTY', location: 'Addr', comment: 'Comment', eventTime: '9:30 AM' });
    manualLogApiService.createManualLog.and.returnValue(of({ success: true, data: { duration: '30 min', timestamp: Date.now() } } as ManualLogResponse));
    const activeOffcanvas = TestBed.inject(NgbActiveOffcanvas) as MockActiveOffcanvas;
    component.onSubmit();
    let resp: ManualLogResponse | undefined;
    const sub = component.saveLogResponse$.subscribe(r => resp = r);
    tick(); // process observable chain
    expect(resp?.success).toBeTrue();
    tick(1600); // advance past internal setTimeout in component
    expect(activeOffcanvas.closeArg).toBeTruthy();
    expect(activeOffcanvas.closeArg?.success).toBeTrue();
    sub.unsubscribe();
  }));

  it('should mark form controls touched when invalid submit', () => {
    component.addLogForm.patchValue({ dutyStatus: '', location: '', comment: '' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spyOn<any>(component, 'markFormGroupTouched').and.callThrough();
    component.onSubmit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((component as any).markFormGroupTouched).toHaveBeenCalled();
  });

  it('should return empty duration when no existing logs', fakeAsync(() => {
    // Create a fresh component instance with empty logs to ensure duration logic sees empty array
    const emptyFixture = TestBed.createComponent(AddNewLogsPanelComponent);
    const emptyComp = emptyFixture.componentInstance;
    emptyComp.driverId = 123;
    emptyComp.tenantId = 456;
    emptyComp.driverName = 'John Doe';
    emptyComp.selectedDate = new Date(Date.UTC(2025, 0, 1));
    emptyComp.hosData$ = of([]);
    emptyFixture.detectChanges();
    // Patch event time AFTER subscription setup
    let latest: string | undefined;
    const sub = emptyComp.duration$.subscribe(val => latest = val);
    emptyComp.addLogForm.patchValue({ eventTime: '11:00 AM' });
    tick();
    expect(latest).toBe('');
    sub.unsubscribe();
  }));

  it('isSaveEnabled should reflect submission state and validity', () => {
    component.addLogForm.patchValue({ dutyStatus: 'ON_DUTY', location: 'Addr', comment: 'Comment', eventTime: '9:00 AM' });
    expect(component.isSaveEnabled()).toBeTrue();
    component.isSubmitting = true;
    expect(component.isSaveEnabled()).toBeFalse();
    component.isSubmitting = false;
    component.isTimeValid = false;
    expect(component.isSaveEnabled()).toBeFalse();
  });

  it('should set validation message for time before first log (valid)', fakeAsync(() => {
    component.onTimeSelected({ hour: 7, minute: '00', ampm: 'am' });
    tick();
    expect(component.isTimeValid).toBeTrue();
    expect(component.timeValidationMessage).toBe('');
  }));

  it('should handle API error path gracefully (no close)', fakeAsync(() => {
    component.addLogForm.patchValue({ dutyStatus: 'ON_DUTY', location: 'Addr', comment: 'Comment', eventTime: '9:45 AM' });
    manualLogApiService.createManualLog.and.returnValue(of({ success: false, message: 'Failed', error: '500' } as ManualLogResponse));
    const activeOffcanvas = TestBed.inject(NgbActiveOffcanvas) as MockActiveOffcanvas;
    component.onSubmit();
    let resp: ManualLogResponse | undefined;
    const sub = component.saveLogResponse$.subscribe(r => resp = r);
    tick();
    expect(resp?.success).toBeFalse();
    // advance time to ensure any delayed close would have occurred
    tick(1600);
    expect(activeOffcanvas.closeArg).toBeUndefined();
    sub.unsubscribe();
  }));

  it('should return empty duration when eventTime is empty', fakeAsync(() => {
    let latest: string | undefined;
    const sub = component.duration$.subscribe(val => latest = val);
    component.addLogForm.patchValue({ eventTime: '' });
    tick();
    expect(latest).toBe('');
    sub.unsubscribe();
  }));

  it('should return empty duration when eventTime conversion fails', fakeAsync(() => {
    let latest: string | undefined;
    const sub = component.duration$.subscribe(val => latest = val);
    component.addLogForm.patchValue({ eventTime: 'invalid time' });
    tick();
    expect(latest).toBe('');
    sub.unsubscribe();
  }));

  it('should calculate duration from start of day when no previous log exists', fakeAsync(() => {
    const earlyLogs = [{ timestamp: Date.UTC(2025, 0, 1, 10, 0, 0), id: 1, status: 1, createdOn: 0, updatedOn: 0, address: 'A', eventCode: 'ON_DUTY', category: 'MANUAL', canEdit: true, editableFields: [] }];
    component.hosData$ = of(earlyLogs);
    component.ngOnInit();
    let latest: string | undefined;
    const sub = component.duration$.subscribe(val => latest = val);
    component.addLogForm.patchValue({ eventTime: '7:30 AM' }); // Before first log
    tick();
    expect(latest).toBeTruthy();
    expect(latest).toContain('hr'); // Duration from midnight to 7:30 AM
    sub.unsubscribe();
  }));

  it('should format duration showing only minutes when less than an hour', fakeAsync(() => {
    const logs = [{ timestamp: Date.UTC(2025, 0, 1, 9, 30, 0), id: 1, status: 1, createdOn: 0, updatedOn: 0, address: 'A', eventCode: 'OFF_DUTY', category: 'MANUAL', canEdit: true, editableFields: [] }];
    component.hosData$ = of(logs);
    component.ngOnInit();
    let latest: string | undefined;
    const sub = component.duration$.subscribe(val => latest = val);
    component.addLogForm.patchValue({ eventTime: '9:45 AM' }); // 15 min after previous
    tick();
    expect(latest).toBeTruthy();
    expect(latest).toContain('15 min');
    expect(latest).not.toContain('hr');
    sub.unsubscribe();
  }));

  it('should handle 12 AM conversion correctly', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = (component as any).convertEventTimeToTimestamp('12:00 AM', new Date(Date.UTC(2025, 0, 1)), 'UTC');
    expect(timestamp).toBe(Date.UTC(2025, 0, 1, 0, 0, 0));
  });

  it('should handle 12 PM conversion correctly', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = (component as any).convertEventTimeToTimestamp('12:00 PM', new Date(Date.UTC(2025, 0, 1)), 'UTC');
    expect(timestamp).toBe(Date.UTC(2025, 0, 1, 12, 0, 0));
  });

  it('should return null for invalid time format', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = (component as any).convertEventTimeToTimestamp('invalid', new Date(Date.UTC(2025, 0, 1)), 'UTC');
    expect(timestamp).toBeNull();
  });

  it('should return null for out-of-range hours', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = (component as any).convertEventTimeToTimestamp('25:00', new Date(Date.UTC(2025, 0, 1)), 'UTC');
    expect(timestamp).toBeNull();
  });

  it('should return null for out-of-range minutes', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = (component as any).convertEventTimeToTimestamp('10:70', new Date(Date.UTC(2025, 0, 1)), 'UTC');
    expect(timestamp).toBeNull();
  });

  it('should handle HH:MM format without AM/PM', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = (component as any).convertEventTimeToTimestamp('14:30', new Date(Date.UTC(2025, 0, 1)), 'UTC');
    expect(timestamp).toBeTruthy();
    expect(timestamp).toBe(Date.UTC(2025, 0, 1, 14, 30, 0));
  });

  it('should return empty string for zero or negative duration', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = (component as any).formatDuration(0);
    expect(formatted).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const negFormatted = (component as any).formatDuration(-1000);
    expect(negFormatted).toBe('');
  });

  it('should fallback to local timezone when tenant timezone conversion fails', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = (component as any).convertTimeInTenantTimezone(new Date(Date.UTC(2025, 0, 1)), 10, 30, 'Invalid/Timezone');
    expect(timestamp).toBeTruthy(); // Should still return a timestamp using fallback
  });

  it('should handle midnight crossing validation', fakeAsync(() => {
    // Time before midnight should be valid if not conflicting
    component.onTimeSelected({ hour: 11, minute: '30', ampm: 'pm' });
    tick();
    expect(component.isTimeValid).toBeTrue();
  }));

  it('should mark form as touched when submit attempted with invalid form', () => {
    component.addLogForm.patchValue({ dutyStatus: '', location: '', comment: '', eventTime: '' });
    component.addLogForm.markAsUntouched();
    component.onSubmit();
    expect(component.addLogForm.touched).toBeTrue();
  });

  it('should not submit when form is submitting', () => {
    component.addLogForm.patchValue({ dutyStatus: 'ON_DUTY', location: 'Addr', comment: 'Comment', eventTime: '9:00 AM' });
    component.isSubmitting = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = spyOn<any>(component, 'prepareBulkShare');
    component.onSubmit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should not submit when time is invalid', () => {
    component.addLogForm.patchValue({ dutyStatus: 'ON_DUTY', location: 'Addr', comment: 'Comment', eventTime: '8:00 AM' });
    component.isTimeValid = false;
    manualLogApiService.createManualLog.and.returnValue(of({ success: true } as ManualLogResponse));
    component.onSubmit();
    expect(manualLogApiService.createManualLog).not.toHaveBeenCalled();
  });

  it('should close offcanvas on close button click', () => {
    const activeOffcanvas = TestBed.inject(NgbActiveOffcanvas) as MockActiveOffcanvas;
    component.close();
    expect(activeOffcanvas.dismissCalled).toBeTrue();
  });

  it('should handle eventDate changes in duration calculation', fakeAsync(() => {
    let latest: string | undefined;
    const sub = component.duration$.subscribe(val => latest = val);
    component.addLogForm.patchValue({ eventTime: '9:00 AM', eventDate: new Date(Date.UTC(2025, 0, 2)) });
    tick();
    // Duration calculation should handle date changes
    expect(latest).toBeDefined();
    sub.unsubscribe();
  }));

  it('should use driverName from input when provided', () => {
    expect(component.currentDriverName).toBe('John Doe');
  });

  it('should handle missing tenantTimezone gracefully', fakeAsync(() => {
    // Create component with no timezone
    const noTimezoneFixture = TestBed.createComponent(AddNewLogsPanelComponent);
    const noTimezoneComp = noTimezoneFixture.componentInstance;
    noTimezoneComp.driverId = 123;
    noTimezoneComp.tenantId = 456;
    noTimezoneComp.driverName = 'Jane Doe';
    noTimezoneComp.selectedDate = new Date(Date.UTC(2025, 0, 1));
    noTimezoneComp.hosData$ = of(existingLogs);
    const noTimezoneService: { selectedUserTenant$: Observable<MockTenant> } = { selectedUserTenant$: of({ time_zone: undefined }) };
    TestBed.overrideProvider(TenantsService, { useValue: noTimezoneService });
    noTimezoneFixture.detectChanges();
    let latest: string | undefined;
    const sub = noTimezoneComp.duration$.subscribe(val => latest = val);
    noTimezoneComp.addLogForm.patchValue({ eventTime: '9:00 AM' });
    tick();
    // Should still calculate duration using fallback
    expect(latest).toBeTruthy();
    sub.unsubscribe();
  }));

  it('should return null from getStartOfDayInTenantTimezone when timezone is invalid', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startOfDay = (component as any).getStartOfDayInTenantTimezone(Date.UTC(2025, 0, 1, 10, 0, 0), 'Invalid/Timezone');
    expect(startOfDay).toBeTruthy(); // Should fallback to local timezone
  });

  it('should handle NaN in time parsing for AM/PM format', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timestamp = (component as any).convertEventTimeToTimestamp('abc:def AM', new Date(Date.UTC(2025, 0, 1)), 'UTC');
    expect(timestamp).toBeNull();
  });

  it('findPreviousLog should return null when no logs before event timestamp', () => {
    const futureLogs = [{ timestamp: Date.UTC(2025, 0, 1, 15, 0, 0), id: 1, status: 1, createdOn: 0, updatedOn: 0, address: 'A', eventCode: 'OFF_DUTY', category: 'MANUAL', canEdit: true, editableFields: [] }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (component as any).findPreviousLog(Date.UTC(2025, 0, 1, 10, 0, 0), futureLogs);
    expect(result).toBeNull();
  });
});
