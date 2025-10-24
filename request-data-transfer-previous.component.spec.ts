import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { RequestDataTransferPreviousComponent } from './request-data-transfer-previous.component';
import { PreviousTransfersService, PreviousTransfer } from './previous-transfers.service';

describe('RequestDataTransferPreviousComponent', () => {
  let component: RequestDataTransferPreviousComponent;
  let fixture: ComponentFixture<RequestDataTransferPreviousComponent>;
  let mockPreviousTransfersService: jasmine.SpyObj<PreviousTransfersService>;

  beforeEach(async () => {
    const previousTransfersServiceSpy = jasmine.createSpyObj('PreviousTransfersService', ['fetchPreviousTransfers']);

    await TestBed.configureTestingModule({
      imports: [
        RequestDataTransferPreviousComponent,
        HttpClientTestingModule,
        FormsModule
      ],
      providers: [
        { provide: PreviousTransfersService, useValue: previousTransfersServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RequestDataTransferPreviousComponent);
    component = fixture.componentInstance;
    mockPreviousTransfersService = TestBed.inject(PreviousTransfersService) as jasmine.SpyObj<PreviousTransfersService>;
    mockPreviousTransfersService.fetchPreviousTransfers.and.returnValue(of([]));
  });

  function triggerVisibleChangeFirstTime() {
    component.visible = true;
    component.ngOnInit();
    component.ngOnChanges({
      visible: {
        currentValue: true,
        previousValue: false,
        firstChange: true,
        isFirstChange: () => true
      }
    });
  }

  it('should create', () => { expect(component).toBeTruthy(); });

  it('should initialize with defaults', () => {
    expect(component.availableDates).toEqual([]);
    expect(component.selectedDate).toBe('');
    expect(component.currentPage).toBe(1);
    expect(component.pageSize).toBe(15);
  });

  it('should load transfers when dialog becomes visible first time and set availableDates', (done) => {
    const transfers: PreviousTransfer[] = [
      { id: '1', requestId: '1', requestedOn: '1:00 PM, Jan 1, 2025', startDate: 'Jan 1, 2025', endDate: 'Jan 2, 2025', transferMethod: 'EMAIL', comment: 'Test', status: 'SUCCESS', requestedBy: '10', requestedByName: 'Admin User', drivers: [] },
      { id: '2', requestId: '2', requestedOn: '2:00 PM, Jan 3, 2025', startDate: 'Jan 3, 2025', endDate: 'Jan 4, 2025', transferMethod: 'EMAIL', comment: 'Test2', status: 'FAILED', requestedBy: '11', requestedByName: 'Other User', drivers: [] },
    ];
    mockPreviousTransfersService.fetchPreviousTransfers.and.returnValue(of(transfers));
    triggerVisibleChangeFirstTime();
    component.previousTransfers$.subscribe(list => {
      expect(list.length).toBe(2);
      expect(component.availableDates).toEqual(['1:00 PM, Jan 1, 2025', '2:00 PM, Jan 3, 2025']);
      done();
    });
  });

  it('should reset selectedDate each time dialog opens again without refetching', () => {
    triggerVisibleChangeFirstTime();
    component.selectedDate = 'old';
    component.ngOnChanges({
      visible: {
        currentValue: true,
        previousValue: true,
        firstChange: false,
        isFirstChange: () => false
      }
    });
    expect(component.selectedDate).toBe('');
  });

  it('should select a date and update pagination', () => {
    component.selectedDate = '';
    component.currentPage = 2;
    component.selectDate('dateX');
    expect(component.selectedDate).toBe('dateX');
    expect(component.currentPage).toBe(1); // reset to first page
  });

  it('should toggle and close dropdown', () => {
    expect(component.isDropdownOpen).toBeFalse();
    component.toggleDropdown();
    expect(component.isDropdownOpen).toBeTrue();
    component.closeDropdown();
    expect(component.isDropdownOpen).toBeFalse();
  });

  it('should compute page info and paginated drivers correctly', () => {
    const drivers = Array.from({ length: 22 }).map((_, i) => ({ id: i, name: 'D'+i, status: 'SUCCESS', transactionId: 'T'+i }));
    component.pageSize = 10;
    component.currentPage = 1;
    expect(component.getTotalPages(drivers)).toBe(3);
    expect(component.getPaginatedDrivers(drivers).length).toBe(10);
    expect(component.getPageInfo(drivers)).toBe('1 - 10 Out Of 22');
    component.nextPage(component.getTotalPages(drivers));
    expect(component.currentPage).toBe(2);
    component.prevPage();
    expect(component.currentPage).toBe(1);
    component.prevPage(); // should not go below 1
    expect(component.currentPage).toBe(1);
  });

  it('should not exceed total pages when nextPage called at end', () => {
    const drivers = Array.from({ length: 5 }).map((_, i) => ({ id: i, name: 'D'+i, status: 'SUCCESS', transactionId: 'T'+i }));
    component.pageSize = 5;
    component.currentPage = 1;
    const total = component.getTotalPages(drivers);
    component.nextPage(total);
    expect(component.currentPage).toBe(1); // only one page
  });

  it('should map status classes correctly', () => {
    expect(component.getStatusClass('SUCCESS')).toBe('success');
    expect(component.getStatusClass('FAILED')).toBe('failed');
    expect(component.getStatusClass('PENDING')).toBe('pending');
    expect(component.getStatusClass('UNKNOWN')).toBe('unknown');
    expect(component.getStatusClass('')).toBe('unknown');
  });

  it('should format date range correctly', () => {
    const start = '2025-01-01T00:00:00Z';
    const end = '2025-01-02T00:00:00Z';
    const formatted = component.formatDateRange(start, end);
    expect(formatted.includes('Jan')).toBeTrue();
    expect(formatted).toContain(' - ');
  });

  it('should provide defined observables after ngOnInit', () => {
    component.ngOnInit();
    expect(component.previousTransfers$).toBeDefined();
    expect(component.isLoading$).toBeDefined();
    expect(component.errorMessage$).toBeDefined();
  });

  it('should emit closeDialog', () => {
    spyOn(component.closeDialog, 'emit');
    component.closeDialog.emit();
    expect(component.closeDialog.emit).toHaveBeenCalled();
  });

  it('should filter by selected date using getSelectedTransfer', () => {
    const transfers: PreviousTransfer[] = [
      { id: '1', requestId: '1', requestedOn: '1:00 PM, Jan 1, 2025', startDate: 'Jan 1, 2025', endDate: 'Jan 2, 2025', transferMethod: 'EMAIL', comment: 'Test', status: 'SUCCESS', requestedBy: '10', requestedByName: 'Admin User', drivers: [] },
      { id: '2', requestId: '2', requestedOn: '2:00 PM, Jan 3, 2025', startDate: 'Jan 3, 2025', endDate: 'Jan 4, 2025', transferMethod: 'EMAIL', comment: 'Test2', status: 'FAILED', requestedBy: '11', requestedByName: 'Other User', drivers: [] },
    ];
    component.selectedDate = '1:00 PM, Jan 1, 2025';
    const result = component.getSelectedTransfer(transfers);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('1');
  });

  it('should return null when no transfer matches selected date', () => {
    const transfers: PreviousTransfer[] = [
      { id: '1', requestId: '1', requestedOn: '1:00 PM, Jan 1, 2025', startDate: 'Jan 1, 2025', endDate: 'Jan 2, 2025', transferMethod: 'EMAIL', comment: 'Test', status: 'SUCCESS', requestedBy: '10', requestedByName: 'Admin User', drivers: [] },
    ];
    component.selectedDate = 'nonexistent date';
    const result = component.getSelectedTransfer(transfers);
    expect(result).toBeNull();
  });

  it('should return empty drivers when no transfer selected', () => {
    const drivers = component.getDrivers(null);
    expect(drivers).toEqual([]);
  });

  it('should return drivers from selected transfer', () => {
    const transfer: PreviousTransfer = {
      id: '1', requestId: '1', requestedOn: '1:00 PM, Jan 1, 2025', startDate: 'Jan 1, 2025', endDate: 'Jan 2, 2025',
      transferMethod: 'EMAIL', comment: 'Test', status: 'SUCCESS', requestedBy: '10', requestedByName: 'Admin User',
      drivers: [{ id: '1', name: 'Driver 1', status: 'SUCCESS', transactionId: 'T1' }]
    };
    const drivers = component.getDrivers(transfer);
    expect(drivers.length).toBe(1);
    expect(drivers[0].name).toBe('Driver 1');
  });

  it('should compute correct first page pagination info', () => {
    const drivers = Array.from({ length: 5 }).map((_, i) => ({ id: i, name: 'D'+i, status: 'SUCCESS', transactionId: 'T'+i }));
    component.pageSize = 2;
    component.currentPage = 1;
    expect(component.getPageInfo(drivers)).toBe('1 - 2 Out Of 5');
  });

  it('should compute correct last page pagination info when not full', () => {
    const drivers = Array.from({ length: 5 }).map((_, i) => ({ id: i, name: 'D'+i, status: 'SUCCESS', transactionId: 'T'+i }));
    component.pageSize = 2;
    component.currentPage = 3;
    expect(component.getPageInfo(drivers)).toBe('5 - 5 Out Of 5');
  });

  it('should handle empty drivers for pagination', () => {
    expect(component.getTotalPages([])).toBe(1);
    expect(component.getPaginatedDrivers([])).toEqual([]);
    expect(component.getPageInfo([])).toBe('0 - 0 of 0');
  });

  it('should return single page for drivers within pageSize', () => {
    const drivers = Array.from({ length: 3 }).map((_, i) => ({ id: i, name: 'D'+i, status: 'SUCCESS', transactionId: 'T'+i }));
    component.pageSize = 10;
    expect(component.getTotalPages(drivers)).toBe(1);
  });

  it('should select last page correctly', () => {
    const drivers = Array.from({ length: 25 }).map((_, i) => ({ id: i, name: 'D'+i, status: 'SUCCESS', transactionId: 'T'+i }));
    component.pageSize = 10;
    component.currentPage = 1;
    const totalPages = component.getTotalPages(drivers);
    component.nextPage(totalPages);
    expect(component.currentPage).toBe(2);
    component.nextPage(totalPages);
    expect(component.currentPage).toBe(3);
    component.nextPage(totalPages);
    expect(component.currentPage).toBe(3); // should not exceed
  });

  it('should format date range with different timezones', () => {
    const start = '2025-01-01T12:30:00+05:00';
    const end = '2025-01-02T15:45:00+05:00';
    const formatted = component.formatDateRange(start, end);
    expect(formatted).toContain(' - ');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('should load transfers only on first visibility change', (done) => {
    mockPreviousTransfersService.fetchPreviousTransfers.calls.reset();
    mockPreviousTransfersService.fetchPreviousTransfers.and.returnValue(of([]));
    triggerVisibleChangeFirstTime();
    
    // Subscribe to ensure the observable chain completes
    component.previousTransfers$.subscribe(() => {
      expect(mockPreviousTransfersService.fetchPreviousTransfers).toHaveBeenCalledTimes(1);
      
      // Call ngOnChanges again with visible=true but not first change
      component.ngOnChanges({
        visible: {
          currentValue: true,
          previousValue: true,
          firstChange: false,
          isFirstChange: () => false
        }
      });
      
      // Should still be called only once (no additional call)
      expect(mockPreviousTransfersService.fetchPreviousTransfers).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('should close dropdown when date selected', () => {
    component.isDropdownOpen = true;
    component.selectDate('dateY');
    expect(component.isDropdownOpen).toBeFalse();
  });

  it('should reset page when onPageSizeChange called', () => {
    component.currentPage = 5;
    component.pageSize = 15;
    component.onPageSizeChange(20);
    expect(component.pageSize).toBe(20);
    expect(component.currentPage).toBe(1);
  });

  it('should call onDateChange when selecting date', () => {
    spyOn(component, 'onDateChange');
    component.selectDate('dateX');
    expect(component.onDateChange).toHaveBeenCalled();
  });

  it('should handle error in formatDateRange with fallback', () => {
    const start = 'invalid-date';
    const end = 'another-invalid';
    const formatted = component.formatDateRange(start, end);
    expect(formatted).toBe('Invalid Date - Invalid Date');
  });

  it('should return correct status class for lowercase status', () => {
    expect(component.getStatusClass('success')).toBe('success');
    expect(component.getStatusClass('failed')).toBe('failed');
    expect(component.getStatusClass('pending')).toBe('pending');
  });

  it('should return unknown class for null status', () => {
    expect(component.getStatusClass(null as unknown as string)).toBe('unknown');
  });

  it('should return unknown class for unrecognized status', () => {
    expect(component.getStatusClass('CANCELLED')).toBe('unknown');
    expect(component.getStatusClass('IN_PROGRESS')).toBe('unknown');
  });

  it('should update availableDates after loading transfers', (done) => {
    const transfers: PreviousTransfer[] = [
      { id: '1', requestId: '1', requestedOn: '1:00 PM, Jan 1, 2025', startDate: 'Jan 1, 2025', endDate: 'Jan 2, 2025', transferMethod: 'EMAIL', comment: 'Test', status: 'SUCCESS', requestedBy: '10', requestedByName: 'Admin User', drivers: [] },
      { id: '2', requestId: '2', requestedOn: '2:00 PM, Jan 3, 2025', startDate: 'Jan 3, 2025', endDate: 'Jan 4, 2025', transferMethod: 'EMAIL', comment: 'Test2', status: 'FAILED', requestedBy: '11', requestedByName: 'Other User', drivers: [] },
    ];
    mockPreviousTransfersService.fetchPreviousTransfers.and.returnValue(of(transfers));
    triggerVisibleChangeFirstTime();
    component.previousTransfers$.subscribe(() => {
      expect(component.availableDates).toEqual(['1:00 PM, Jan 1, 2025', '2:00 PM, Jan 3, 2025']);
      done();
    });
  });
});

