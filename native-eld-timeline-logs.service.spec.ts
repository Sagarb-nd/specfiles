import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NativeEldTimelineLogsService, HosLog } from './native-eld-timeline-logs.service';
import { GLOBAL_SETTINGS } from 'src/app/configs/CONSTANTS';

(GLOBAL_SETTINGS as { driveriOneBaseUrl?: string }).driveriOneBaseUrl = 'http://base-host';

describe('NativeEldTimelineLogsService', () => {
  let service: NativeEldTimelineLogsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });
    service = TestBed.inject(NativeEldTimelineLogsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should GET HOS logs with correct URL params', () => {
    service.getHosLogs(1,2,100,200,false).subscribe(resp => {
      expect(resp).toBeTruthy();
    });
    const req = httpMock.expectOne(r => r.url.includes('startTime=100') && r.url.includes('endTime=200'));
    expect(req.request.method).toBe('GET');
    req.flush({ response: true, status: 200, message: 'ok', data: { certified: true, logs: [] } });
  });

  it('should POST pending log when adding hos log', () => {
    service.addHosLog(1,2,{ timestamp: 123, address: 'Addr', eventCode: 'OFF_DUTY', category: 'MANUAL' }, 'driver').subscribe(resp => {
      expect(resp).toBeTruthy();
    });
    const req = httpMock.expectOne(r => r.method === 'POST');
    expect(req.request.body.isPending).toBeTrue();
    req.flush({ ok: true });
  });

  it('should PUT approve and reject endpoints', () => {
    service.approveLog(1,2,99).subscribe();
    let req = httpMock.expectOne(r => r.url.endsWith('/99/approve'));
    expect(req.request.method).toBe('PUT');
    req.flush({});

    service.rejectLog(1,2,99).subscribe();
    req = httpMock.expectOne(r => r.url.endsWith('/99/reject'));
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('simulatePendingLog should return constructed object', () => {
    const log: HosLog = service.simulatePendingLog({ address: 'Loc' }, 'manager');
    expect(log.isPending).toBeTrue();
    expect(log.requestedBy).toBe('manager');
    expect(log.address).toBe('Loc');
  });

  it('should GET HOS logs with showHiddenLogs true', () => {
    service.getHosLogs(3,4,500,600,true).subscribe(resp => {
      expect(resp.data.certified).toBeFalse();
    });
    const req = httpMock.expectOne(r => r.url.includes('showHiddenLogs=true'));
    expect(req.request.method).toBe('GET');
    req.flush({ response: true, status: 200, message: 'ok', data: { certified: false, logs: [] } });
  });

  it('addHosLog should include requestedBy manager and pending fields', () => {
    service.addHosLog(10,20,{ eventCode: 'DRIVING', category: 'MANUAL' }, 'manager').subscribe(resp => {
      expect(resp).toBeTruthy();
    });
    const req = httpMock.expectOne(r => r.method === 'POST');
    expect(req.request.body.requestedBy).toBe('manager');
    expect(req.request.body.approvalStatus).toBe('pending');
    req.flush({ ok: true });
  });

  it('getPendingLogs should return empty array observable', (done) => {
    service.getPendingLogs().subscribe(arr => {
      expect(Array.isArray(arr)).toBeTrue();
      expect(arr.length).toBe(0);
      done();
    });
  });

  it('simulatePendingLog should set defaults when fields missing', () => {
    const log = service.simulatePendingLog({}, 'driver');
    expect(log.eventCode).toBe('OFF_DUTY');
    expect(log.category).toBe('MANUAL');
    expect(log.address).toBe('Unknown Location');
    expect(log.approvalStatus).toBe('pending');
  });
});
