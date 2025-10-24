import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ManualLogApiService, LogFormData, ManualLogResponse } from './manual-log-api.service';
import { GLOBAL_SETTINGS } from 'src/app/configs/CONSTANTS';

// Provide minimal GLOBAL_SETTINGS for URL building
(GLOBAL_SETTINGS as { driveriOneBaseUrl?: string }).driveriOneBaseUrl = 'http://test-base';

describe('ManualLogApiService', () => {
  let service: ManualLogApiService;
  let httpMock: HttpTestingController;
  const tenantId = 1; const driverId = 2; const initiatorId = 3;
  const selectedDate = new Date(Date.UTC(2025, 0, 1));
  const timezone = 'UTC';
  const existingLogs = [
    { timestamp: Date.UTC(2025,0,1,8,0,0) },
    { timestamp: Date.UTC(2025,0,1,10,0,0) },
  ] as unknown as Parameters<typeof service.createManualLog>[5];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });
    service = TestBed.inject(ManualLogApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should error for missing parameters', (done) => {
    service.createManualLog(0, driverId, initiatorId, { dutyStatus: 'ON_DUTY', eventTime: '9:00 AM', location: 'L', comment: 'C', logOwner: 'X' }, selectedDate, existingLogs, timezone)
      .subscribe({
        next: () => {},
        error: (err: ManualLogResponse) => {
          expect(err.error).toBe('MISSING_PARAMETERS');
          done();
        }
      });
  });

  it('should error for missing duty status', (done) => {
    const data: LogFormData = { dutyStatus: '', eventTime: '9:00 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, existingLogs, timezone).subscribe({
      error: (err: ManualLogResponse) => { expect(err.error).toBe('MISSING_STATUS'); done(); }
    });
  });

  it('should error for invalid time format', (done) => {
    const data: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '99:99', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, existingLogs, timezone).subscribe({
      error: (err: ManualLogResponse) => { expect(err.error).toBe('INVALID_TIMESTAMP'); done(); }
    });
  });

  it('should error when duration calculation fails (no logs)', (done) => {
    const data: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '9:00 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, [], timezone).subscribe({
      error: (err: ManualLogResponse) => { expect(err.error).toBe('DURATION_CALCULATION_FAILED'); done(); }
    });
  });

  it('should POST and map success response', () => {
    const data: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '9:30 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, existingLogs, timezone).subscribe(resp => {
      expect(resp.success).toBeTrue();
      expect(resp.message).toContain('Log entry');
    });
    const req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    expect(req.request.method).toBe('POST');
    // Duration should be difference between next log (10:00) and 9:30 => 30 min => 1800000 ms
    expect(+req.request.body.duration).toBe(30*60*1000);
    req.flush({ success: true, message: 'Log entry created successfully', data: { duration: '30 min' } });
  });

  it('should map HTTP error status 400 to friendly message', () => {
    const data: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '9:30 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, existingLogs, timezone).subscribe({
      next: () => fail('Should error'),
      error: (err: ManualLogResponse) => {
        expect(err.success).toBeFalse();
        expect(err.message).toContain('Bad Request');
      }
    });
    const req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    req.flush({ message: 'Bad Request' }, { status: 400, statusText: 'Bad Request' });
  });

  it('should map HTTP 500 error to internal server message', () => {
    const data: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '9:30 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, existingLogs, timezone).subscribe({
      next: () => fail('Should error'),
      error: (err: ManualLogResponse) => {
        expect(err.error).toBe('500');
        expect(err.message).toContain('Internal Server Error');
      }
    });
    const req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    req.flush({ message: 'Internal Server Error' }, { status: 500, statusText: 'Server Error' });
  });

  it('should calculate start-of-day duration when event at beginning of day', () => {
    const data: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '12:00 AM', location: 'L', comment: 'C', logOwner: 'X' };
    // existing logs later in day
    const laterLogs = [ { timestamp: Date.UTC(2025,0,1,8,0,0) }, { timestamp: Date.UTC(2025,0,1,10,0,0) } ] as unknown as Parameters<typeof service.createManualLog>[5];
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, laterLogs, timezone).subscribe(resp => {
      expect(resp.success).toBeTrue();
    });
    const req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    // Duration should be 8 hours from start-of-day to first log
    expect(+req.request.body.duration).toBe(8*60*60*1000);
    req.flush({ success: true, message: 'ok', data: { duration: '8 hr 0 min' } });
  });

  it('should calculate end-of-day duration when event near end', () => {
    const data: LogFormData = { dutyStatus: 'OFF_DUTY', eventTime: '11:59 PM', location: 'L', comment: 'C', logOwner: 'X' };
    const earlierLogs = [ { timestamp: Date.UTC(2025,0,1,8,0,0) }, { timestamp: Date.UTC(2025,0,1,22,0,0) } ] as unknown as Parameters<typeof service.createManualLog>[5]; // 10 PM
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, earlierLogs, timezone).subscribe(resp => {
      expect(resp.success).toBeTrue();
    });
    const req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    // End of day 23:59:59.999 minus 23:59:00 => 59,999 ms
    expect(+req.request.body.duration).toBe(59999);
    req.flush({ success: true, message: 'ok', data: { duration: '0 hr 0 min' } });
  });

  it('should calculate between two logs duration when inserted between', () => {
    const data: LogFormData = { dutyStatus: 'DRIVING', eventTime: '9:00 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, existingLogs, timezone).subscribe(resp => {
      expect(resp.success).toBeTrue();
    });
    const req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    // Next log 10:00 AM -> duration 60 min
    expect(+req.request.body.duration).toBe(60*60*1000);
    req.flush({ success: true, message: 'ok', data: { duration: '1 hr 0 min' } });
  });

  it('should use default 1 hour duration when no surrounding logs (exact match case)', () => {
    const singleLog = [ { timestamp: Date.UTC(2025,0,1,8,0,0) } ] as unknown as Parameters<typeof service.createManualLog>[5];
    const data: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '8:00 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, singleLog, timezone).subscribe(resp => {
      expect(resp.success).toBeTrue();
    });
    const req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    expect(+req.request.body.duration).toBe(60*60*1000);
    req.flush({ success: true, message: 'ok', data: { duration: '1 hr 0 min' } });
  });

  it('should error for invalid timezone producing invalid DateTime', (done) => {
    const data: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '9:00 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, data, selectedDate, existingLogs, 'Invalid/Zone').subscribe({
      error: (err: ManualLogResponse) => { expect(err.error).toBe('INVALID_TIMESTAMP'); done(); }
    });
  });

  it('should convert 12:00 PM to midday timestamp and 12:00 AM to start-of-day', () => {
    // midday case
    const middayData: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '12:00 PM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, middayData, selectedDate, existingLogs, timezone).subscribe(resp => {
      expect(resp.success).toBeTrue();
    });
    let req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    const middayTs = +req.request.body.timeStamp;
    req.flush({ success: true, message: 'ok' });

    // start-of-day case
    const startData: LogFormData = { dutyStatus: 'ON_DUTY', eventTime: '12:00 AM', location: 'L', comment: 'C', logOwner: 'X' };
    service.createManualLog(tenantId, driverId, initiatorId, startData, selectedDate, existingLogs, timezone).subscribe(resp => {
      expect(resp.success).toBeTrue();
    });
    req = httpMock.expectOne(r => r.url.includes('/manual-entry'));
    const startTs = +req.request.body.timeStamp;
    req.flush({ success: true, message: 'ok' });

    // Difference between midday and start should be 12 hours
    expect(middayTs - startTs).toBe(12*60*60*1000);
  });
});
