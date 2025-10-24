import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PreviousTransfersService, PreviousTransfersResponse } from './previous-transfers.service';
import { GLOBAL_SETTINGS } from 'src/app/configs/CONSTANTS';
import { of } from 'rxjs';
import { TenantsService } from '../../../../../../nd-authentication/tenant/tenants.service';

(GLOBAL_SETTINGS as { driveriOneBaseUrl?: string }).driveriOneBaseUrl = 'http://base-url';

describe('PreviousTransfersService', () => {
  let service: PreviousTransfersService;
  let httpMock: HttpTestingController;
  const tenantsServiceMock = { selectedTenantID$: of('777') };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: TenantsService, useValue: tenantsServiceMock }
      ]
    });
    service = TestBed.inject(PreviousTransfersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function issueRequestAndFlush(payload: PreviousTransfersResponse | Partial<PreviousTransfersResponse>) {
    const req = httpMock.expectOne(r => r.url.includes('/bulk-share'));
    req.flush(payload);
  }

  it('should fetch and transform previous transfers (FAILED overall when any failed)', (done) => {
    service.fetchPreviousTransfers().subscribe(list => {
      expect(list.length).toBe(1);
      expect(list[0].drivers.length).toBe(2);
      expect(list[0].status).toBe('FAILED'); // one driver failed triggers FAILED
      expect(list[0].drivers[0].name).toBe('F L');
      expect(list[0].drivers[1].name).toBe('F2 L2');
      done();
    });
    issueRequestAndFlush(buildPayload({
      individualRequests: [
        { driverId: 1, transactionId: 'T1', status: 'SUCCESS' },
        { driverId: 2, transactionId: 'T2', status: 'FAILED' }
      ]
    }));
  });

  it('should compute overall status = PENDING when no FAILED but some PENDING', (done) => {
    service.fetchPreviousTransfers().subscribe(list => {
      expect(list[0].status).toBe('PENDING');
      done();
    });
    issueRequestAndFlush(buildPayload({
      individualRequests: [
        { driverId: 1, transactionId: 'T1', status: 'SUCCESS' },
        { driverId: 2, transactionId: 'T2', status: 'PENDING' }
      ]
    }));
  });

  it('should compute overall status = SUCCESS when all succeed', (done) => {
    service.fetchPreviousTransfers().subscribe(list => {
      expect(list[0].status).toBe('SUCCESS');
      done();
    });
    issueRequestAndFlush(buildPayload({
      individualRequests: [
        { driverId: 1, transactionId: 'T1', status: 'SUCCESS' },
        { driverId: 2, transactionId: 'T2', status: 'SUCCESS' }
      ]
    }));
  });

  it('should fall back to UNKNOWN status for missing driver status', (done) => {
    service.fetchPreviousTransfers().subscribe(list => {
      expect(list[0].drivers[0].status).toBe('UNKNOWN');
      done();
    });
    issueRequestAndFlush(buildPayload({
      individualRequests: [
        // omit status
        { driverId: 1, transactionId: 'T1', status: undefined as unknown as string }
      ]
    }));
  });

  it('should construct driver name using firstName only when lastName missing', (done) => {
    service.fetchPreviousTransfers().subscribe(list => {
      expect(list[0].drivers[0].name).toBe('OnlyFirst');
      done();
    });
    issueRequestAndFlush(buildPayload({
      driversOverride: {
        '1': { nickname: 'D1Nick', firstName: 'OnlyFirst', lastName: '' }
      },
      individualRequests: [
        { driverId: 1, transactionId: 'T1', status: 'SUCCESS' }
      ]
    }));
  });

  it('should construct driver name using lastName only when firstName missing', (done) => {
    service.fetchPreviousTransfers().subscribe(list => {
      expect(list[0].drivers[0].name).toBe('OnlyLast');
      done();
    });
    issueRequestAndFlush(buildPayload({
      driversOverride: {
        '1': { nickname: 'D1Nick', firstName: '', lastName: 'OnlyLast' }
      },
      individualRequests: [
        { driverId: 1, transactionId: 'T1', status: 'SUCCESS' }
      ]
    }));
  });

  it('should use numeric placeholder when driver not found', (done) => {
    service.fetchPreviousTransfers().subscribe(list => {
      expect(list[0].drivers[0].name).toBe('Driver 99');
      done();
    });
    issueRequestAndFlush(buildPayload({
      individualRequests: [
        { driverId: 99, transactionId: 'T1', status: 'SUCCESS' }
      ]
    }));
  });

  it('should return empty array for non-200 status', (done) => {
    service.fetchPreviousTransfers().subscribe(list => { expect(list.length).toBe(0); done(); });
    issueRequestAndFlush({ response: true, status: 500, message: 'err', data: { bulkRequests: [], users: {}, drivers: {} } });
  });

  it('should return empty array for error (network/CORS)', (done) => {
    service.fetchPreviousTransfers().subscribe(list => { expect(list).toEqual([]); done(); });
    const req = httpMock.expectOne(r => r.url.includes('/bulk-share'));
    req.flush('Network error', { status: 0, statusText: 'Unknown Error' });
  });

  it('should handle missing data section gracefully', (done) => {
    service.fetchPreviousTransfers().subscribe(list => { expect(list).toEqual([]); done(); });
    issueRequestAndFlush({ response: true, status: 200, message: 'ok', data: { bulkRequests: [], users: {}, drivers: {} } });
  });

  // Utility to build payloads with overrides
  function buildPayload(opts: {
    individualRequests: Array<{ driverId: number; transactionId: string; status?: string }>,
    driversOverride?: Record<string, { nickname: string; firstName: string; lastName: string }>,
    usersOverride?: Record<string, { username: string; firstName: string; lastName: string }>
  }): PreviousTransfersResponse {
    return {
      response: true,
      status: 200,
      message: 'ok',
      data: {
        users: opts.usersOverride || { '10': { username: 'u10', firstName: 'Admin', lastName: 'User' } },
        drivers: opts.driversOverride || {
          '1': { nickname: 'D1', firstName: 'F', lastName: 'L' },
          '2': { nickname: 'D2', firstName: 'F2', lastName: 'L2' }
        },
        bulkRequests: [
          {
            requestId: 'R1', startTime: Date.UTC(2025,0,1), endTime: Date.UTC(2025,0,2), transferMode: 'EMAIL', comment: 'C', testRequest: false,
            requestedBy: 10, requestedOn: Date.UTC(2025,0,3),
            individualRequests: opts.individualRequests.map(ir => ({
              driverId: ir.driverId,
              transactionId: ir.transactionId,
              status: ir.status ?? '' // empty string to trigger UNKNOWN path
            }))
          }
        ]
      }
    };
  }
});

