import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatDateTimeGerman } from '../../core/logic/time';
import { GradeChange } from '../../core/models';

/** Reiter „Protokoll“: jede Änderung an freigegebenen Noten, mit Begründung. */
@Component({
  selector: 'app-grades-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './log-tab.html',
  styleUrl: './grades-tab.scss',
})
export class GradesLogTab {
  readonly active = input.required<boolean>();
  readonly changes = input.required<GradeChange[]>();

  readonly formatDateTime = formatDateTimeGerman;
}
