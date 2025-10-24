import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NativeEldTimelineMetadataService } from './native-eld-timeline-metadata.service';

describe('NativeEldTimelineMetadataService', () => {
  let service: NativeEldTimelineMetadataService;
  let httpMock: HttpTestingController;
  const tenantId = '123';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });
    service = TestBed.inject(NativeEldTimelineMetadataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should map event code metadata correctly', () => {
    service.getTimelineEventCodeMetadata(tenantId).subscribe(meta => {
      expect(meta.DRIVING).toEqual({ label: 'Driving' });
      expect(meta.OFF_DUTY).toEqual({ label: 'Off Duty' });
      expect(meta.YARD_MOVES).toEqual({ label: 'Yard Moves' });
      expect(meta.PERSONAL_CONVEYANCE).toEqual({ label: 'Personal Conveyance' });
    });
    const req = httpMock.expectOne(r => r.url.includes(`/tenants/${tenantId}/hos-metadata`));
    expect(req.request.method).toBe('GET');
    req.flush({ data: { eventCode: {
      OFF_DUTY: { label: 'Off Duty' },
      SLEEPER_BERTH: { label: 'Sleeper Berth' },
      DRIVING: { label: 'Driving' },
      ON_DUTY: { label: 'On Duty' },
      YARD_MOVES: { label: 'Yard Moves' },
      PERSONAL_CONVEYANCE: { label: 'Personal Conveyance' }
    } } });
  });

  it('should return empty object on error', () => {
    service.getTimelineEventCodeMetadata(tenantId).subscribe(meta => {
      // On error catchError returns {}
      expect(Object.keys(meta).length).toBe(0);
    });
    const req = httpMock.expectOne(r => r.url.includes(`/tenants/${tenantId}/hos-metadata`));
    req.flush('Server error', { status: 500, statusText: 'Server Error' });
  });

  it('should handle missing data field gracefully', () => {
    service.getTimelineEventCodeMetadata(tenantId).subscribe(meta => {
      expect(meta).toEqual({
        OFF_DUTY: undefined,
        SLEEPER_BERTH: undefined,
        DRIVING: undefined,
        ON_DUTY: undefined,
        YARD_MOVES: undefined,
        PERSONAL_CONVEYANCE: undefined
      });
    });
    const req = httpMock.expectOne(r => r.url.includes(`/tenants/${tenantId}/hos-metadata`));
    req.flush({});
  });

  it('should handle partial eventCode keys', () => {
    service.getTimelineEventCodeMetadata(tenantId).subscribe(meta => {
      expect(meta.DRIVING).toEqual({ label: 'Driving' });
      expect(meta.ON_DUTY).toBeUndefined();
      expect(meta.OFF_DUTY).toBeUndefined();
    });
    const req = httpMock.expectOne(r => r.url.includes(`/tenants/${tenantId}/hos-metadata`));
    req.flush({ data: { eventCode: { DRIVING: { label: 'Driving' } } } });
  });
});
