import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RequestDataTransferButtonComponent } from './request-data-transfer-button.component';
import { By } from '@angular/platform-browser';

/**
 * Unit tests for `RequestDataTransferButtonComponent`.
 * Focus: state transitions of `open`, event emissions, accessibility attributes, and outside click closing.
 */
describe('RequestDataTransferButtonComponent', () => {
  let fixture: ComponentFixture<RequestDataTransferButtonComponent>;
  let component: RequestDataTransferButtonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestDataTransferButtonComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(RequestDataTransferButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function getToggleButton(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('.rdt-btn')).nativeElement as HTMLButtonElement;
  }

  it('should render initial closed state with aria-expanded="false"', () => {
    const btn = getToggleButton();
    expect(component.open).toBeFalse();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const menu = fixture.debugElement.query(By.css('.rdt-menu'));
    expect(menu).toBeNull();
  });

  it('should toggle menu open on button click and set aria-expanded', () => {
    const btn = getToggleButton();
    btn.click();
    fixture.detectChanges();
    expect(component.open).toBeTrue();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const menu = fixture.debugElement.query(By.css('.rdt-menu'));
    expect(menu).not.toBeNull();
  });

  it('should close menu when toggled twice', () => {
    const btn = getToggleButton();
    btn.click(); // open
    fixture.detectChanges();
    btn.click(); // close
    fixture.detectChanges();
    expect(component.open).toBeFalse();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const menu = fixture.debugElement.query(By.css('.rdt-menu'));
    expect(menu).toBeNull();
  });

  it('should emit newRequest and close when New Request clicked', () => {
    const newSpy = jasmine.createSpy('newSpy');
    component.newRequest.subscribe(newSpy);

    const btn = getToggleButton();
    btn.click(); // open
    fixture.detectChanges();

    const newBtnDe = fixture.debugElement.query(By.css('.rdt-item'));
    expect(newBtnDe).not.toBeNull();
    (newBtnDe.nativeElement as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(newSpy).toHaveBeenCalledTimes(1);
    expect(component.open).toBeFalse();
  });

  it('should emit previousTransfers and close when Previous Transfers clicked', () => {
    const prevSpy = jasmine.createSpy('prevSpy');
    component.previousTransfers.subscribe(prevSpy);

    const btn = getToggleButton();
    btn.click(); // open
    fixture.detectChanges();

    // second item after separator
    const items = fixture.debugElement.queryAll(By.css('.rdt-item'));
    expect(items.length).toBe(2);
    (items[1].nativeElement as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(prevSpy).toHaveBeenCalledTimes(1);
    expect(component.open).toBeFalse();
  });

  it('should close when clicking outside (document click)', () => {
    const btn = getToggleButton();
    btn.click(); // open
    fixture.detectChanges();
    expect(component.open).toBeTrue();

    // Dispatch a document click
    document.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(component.open).toBeFalse();
  });

  it('should stop propagation on toggleMenu to avoid immediate close via document listener', () => {
    const stopSpy = jasmine.createSpy('stopPropagation');
    const fakeEvent = { stopPropagation: stopSpy } as unknown as Event;

    // Initially closed; invoking toggle should open and call stopPropagation
    component.toggleMenu(fakeEvent);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(component.open).toBeTrue();

    // Invoke again closes it
    component.toggleMenu(fakeEvent);
    expect(component.open).toBeFalse();
  });

  it('should not close if already closed when document click occurs', () => {
    expect(component.open).toBeFalse();
    document.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    // remains false
    expect(component.open).toBeFalse();
  });
});
