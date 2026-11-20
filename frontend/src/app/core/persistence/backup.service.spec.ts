import { TestBed } from '@angular/core/testing';
import { BackupService } from './backup.service';
import { OneDriveService } from './onedrive.service';
import { VaultService } from './vault.service';
import { LocalStore } from '../store/local-store';

describe('BackupService', () => {
  let oneDrive: jasmine.SpyObj<OneDriveService>;
  let vault: jasmine.SpyObj<VaultService> & { fileName: () => string };
  let store: LocalStore;

  function setup(): BackupService {
    oneDrive = jasmine.createSpyObj<OneDriveService>('OneDriveService', ['latestBackupAt']);
    vault = Object.assign(jasmine.createSpyObj<VaultService>('VaultService', ['saveBackupCopy']), {
      fileName: () => 'bestand.sitzordnung',
    }) as never;
    TestBed.configureTestingModule({
      providers: [
        { provide: OneDriveService, useValue: oneDrive },
        { provide: VaultService, useValue: vault },
      ],
    });
    store = TestBed.inject(LocalStore);
    return TestBed.inject(BackupService);
  }

  beforeEach(() => localStorage.removeItem('sitzordnung.sicherung-spaeter'));

  async function open(service: BackupService): Promise<void> {
    store.createNew();
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(service).toBeTruthy();
  }

  it('erinnert, wenn die neueste Kopie im OneDrive-Ordner sieben Tage alt ist', async () => {
    const service = setup();
    oneDrive.latestBackupAt.and.resolveTo(new Date(Date.now() - 8 * 86_400_000).toISOString());
    await open(service);
    expect(service.due(true)).toEqual({ days: 8 });
    expect(oneDrive.latestBackupAt).toHaveBeenCalledTimes(1);
  });

  it('erinnert nicht, wenn ein anderes Gerät gerade gesichert hat', async () => {
    const service = setup();
    oneDrive.latestBackupAt.and.resolveTo(new Date().toISOString());
    await open(service);
    expect(service.due(true)).toBeNull();
  });

  it('erinnert, wenn es noch keine Kopie gibt - und nach dem Sichern nicht mehr', async () => {
    const service = setup();
    oneDrive.latestBackupAt.and.resolveTo(null);
    vault.saveBackupCopy.and.resolveTo(new Date().toISOString());
    await open(service);
    expect(service.due(true)).toEqual({ days: null });

    await service.createBackup();
    expect(service.due(true)).toBeNull();
  });

  it('„Später“ blendet die Erinnerung für heute aus', async () => {
    const service = setup();
    oneDrive.latestBackupAt.and.resolveTo(null);
    await open(service);
    service.snooze();
    expect(service.due(true)).toBeNull();
  });
});
