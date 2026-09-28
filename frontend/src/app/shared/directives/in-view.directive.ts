import { Directive, ElementRef, OnDestroy, OnInit, inject, output } from '@angular/core';

/**
 * Emits once, the first time the element comes near the viewport, then stops watching.
 *
 * For work that should only happen for what someone actually scrolls to — the roster's name cards
 * are a live game read each, and most of a long roster is never looked at.
 */
@Directive({ selector: '[appInView]', standalone: true })
export class InViewDirective implements OnInit, OnDestroy {
  readonly appInView = output<void>();
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    // No observer (a very old browser): treat it as in view, which is how it would look anyway.
    if (typeof IntersectionObserver === 'undefined') { this.appInView.emit(); return; }
    this.observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      this.observer?.disconnect();
      this.appInView.emit();
    }, { rootMargin: '200px 0px' });
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
