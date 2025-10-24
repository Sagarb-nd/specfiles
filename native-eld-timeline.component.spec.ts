import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NativeEldTimelineComponent, EventCode, LogCategory, LogStatus } from './native-eld-timeline.component';
import { HosLog } from './native-eld-timeline-logs.service';

function makeLog(partial: Partial<HosLog>): HosLog {
  return {
    id: partial.id ?? Date.now(),
    status: partial.status ?? LogStatus.ACTIVE,
    createdOn: partial.createdOn ?? Date.now(),
    updatedOn: partial.updatedOn ?? Date.now(),
    timestamp: partial.timestamp ?? Date.now(),
    duration: partial.duration,
    address: partial.address ?? 'Addr',
    eventCode: partial.eventCode ?? EventCode.OFF_DUTY,
    category: partial.category ?? LogCategory.MANUAL_ENTRY,
    canEdit: partial.canEdit ?? true,
    editableFields: partial.editableFields ?? [],
    isPending: partial.isPending,
    approvalStatus: partial.approvalStatus,
    pendingApprovalDate: partial.pendingApprovalDate,
  } as HosLog;
}

describe('NativeEldTimelineComponent', () => {
  let fixture: ComponentFixture<NativeEldTimelineComponent>;
  let component: NativeEldTimelineComponent;
  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);
  const baseTs = startOfDay.getTime();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NativeEldTimelineComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(NativeEldTimelineComponent);
    component = fixture.componentInstance;
    // Neutralize DOM-dependent code that triggers afterAll resize issues
    type ComponentWithPrivate = { checkTextOverflow: () => void; eventBars: { length: number; forEach: (cb: () => void) => void } };
    spyOn(component as unknown as ComponentWithPrivate, 'checkTextOverflow').and.stub();
    // Provide a stub for eventBars to avoid undefined forEach
    (component as unknown as ComponentWithPrivate).eventBars = { length: 0, forEach: () => {} };
    // Override onResize to prevent re-invoking original logic after fixture destroy
    component.onResize = () => {};
  });

  afterEach(() => {
    // Ensure component teardown won't call original methods
    if (component) {
      component.onResize = () => {};
      type ComponentWithPrivate = { eventBars: { length: number; forEach: (cb: () => void) => void } };
      (component as unknown as ComponentWithPrivate).eventBars = { length: 0, forEach: () => {} };
    }
  });

  it('should create component', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should compute events filtering hidden types and inactive logs', () => {
    component.logs = [
      makeLog({ id:1, timestamp: baseTs, duration: 60*60*1000, eventCode: EventCode.DRIVING }),
      makeLog({ id:2, timestamp: baseTs + 2*60*60*1000, duration: 30*60*1000, eventCode: EventCode.INTERMEDIATE_LOG_LOW_PRECISION_LOCATION }), // hidden
      makeLog({ id:3, status: LogStatus.INACTIVE_CHANGED, timestamp: baseTs + 3*60*60*1000, duration: 30*60*1000, eventCode: EventCode.ON_DUTY }), // inactive
      makeLog({ id:4, timestamp: baseTs + 4*60*60*1000, duration: 15*60*1000, eventCode: EventCode.ON_DUTY }),
      makeLog({ id:5, timestamp: baseTs + 5*60*60*1000 }) // OFF_DUTY with no duration - ongoing allowed
    ];
    fixture.detectChanges();
    expect(component.events.length).toBe(3); // driving, on_duty, off_duty ongoing
    expect(component.events.map(e => e.id)).toEqual([1,4,5]);
  });

  it('should calculate duty status durations', () => {
    component.logs = [
      makeLog({ eventCode: EventCode.DRIVING, duration: 30*60*1000, timestamp: baseTs + 10 }),
      makeLog({ eventCode: EventCode.DRIVING, duration: 15*60*1000, timestamp: baseTs + 40*60*1000 }),
      makeLog({ eventCode: EventCode.ON_DUTY, duration: 45*60*1000, timestamp: baseTs + 70*60*1000 }),
      makeLog({ eventCode: EventCode.OFF_DUTY, duration: 0, timestamp: baseTs + 120*60*1000 }) // zero duration ignored
    ];
    fixture.detectChanges();
    component.ngOnInit();
    const drivingSummary = component.dutyStatusSummaries.find(s => s.eventCode === EventCode.DRIVING)!;
    const onDutySummary = component.dutyStatusSummaries.find(s => s.eventCode === EventCode.ON_DUTY)!;
    expect(drivingSummary.duration).toBe(45*60*1000);
    expect(onDutySummary.duration).toBe(45*60*1000);
    expect(component.totalDutyStatusMs).toBe(90*60*1000);
  });

  it('formatDuration should handle hours, minutes and invalid', () => {
    expect(component.formatDuration(3*60*60*1000 + 5*60*1000)).toBe('03 hr 05m');
    expect(component.formatDuration(25*60*1000)).toBe('25m');
    expect(component.formatDuration(-1)).toBe('00 hr');
    expect(component.formatDuration(NaN)).toBe('00 hr');
  });

  it('formatDurationForBar should display hour/min combos', () => {
    expect(component.formatDurationForBar(3*60*60*1000 + 5*60*1000)).toBe('3h 5m');
    expect(component.formatDurationForBar(60*60*1000)).toBe('1h');
    expect(component.formatDurationForBar(25*60*1000)).toBe('25m');
    expect(component.formatDurationForBar(-1)).toBe('0hr');
  });

  it('isPreviousDayContinuation should detect previous day log extending into current day', () => {
    const prevDayLog = makeLog({ timestamp: baseTs - 2*60*60*1000, duration: 3*60*60*1000, eventCode: EventCode.ON_DUTY });
    component.logs = [prevDayLog];
    fixture.detectChanges();
    type ComponentWithPrivate = { isPreviousDayContinuation: (log: HosLog) => boolean };
    expect((component as unknown as ComponentWithPrivate).isPreviousDayContinuation(prevDayLog)).toBeTrue();
  });

  it('getEventStyle should constrain widths within day limits', () => {
    const longLog = makeLog({ timestamp: baseTs + 60*60*1000, duration: 10*60*60*1000, eventCode: EventCode.DRIVING });
    component.logs = [longLog];
    fixture.detectChanges();
    const style = component.getEventStyle(component.events[0]);
    expect(style.left).toContain('%');
    expect(style.width).toContain('%');
    // width should not exceed 100%
    const widthVal = parseFloat(style.width.replace('%',''));
    expect(widthVal).toBeLessThanOrEqual(100);
  });

  it('pendingLogs and isPendingLog should identify pending entries', () => {
    const pending = makeLog({ id: 9, isPending: true, approvalStatus: 'pending', eventCode: EventCode.DRIVING });
    const approved = makeLog({ id: 10, isPending: true, approvalStatus: 'approved', eventCode: EventCode.DRIVING });
    component.logs = [pending, approved];
    fixture.detectChanges();
    expect(component.pendingLogs.length).toBe(2); // filter only isPending == true
    expect(component.isPendingLog(pending)).toBeTrue();
    expect(component.isPendingLog(approved)).toBeFalse();
  });

  it('formatDurationLabel should strip 00mins and ongoing', () => {
    expect(component.formatDurationLabel('Ongoing')).toBe('');
    expect(component.formatDurationLabel('1h 00mins')).toBe('1h');
    expect(component.formatDurationLabel('')).toBe('');
  });

  it('zoomIn/zoomOut should adjust zoomLevel within bounds', () => {
    component.zoomLevel = 1;
    component.zoomIn();
    expect(component.zoomLevel).toBe(1.25);
    component.zoomOut();
    expect(component.zoomLevel).toBe(1);
    component.zoomOut(); // should not go below min
    expect(component.zoomLevel).toBe(1);
  });
});
