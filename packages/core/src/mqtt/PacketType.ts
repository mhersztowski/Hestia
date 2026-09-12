export enum PacketType {
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_DELETE = 'file_delete',
  FILE_LIST = 'file_list',
  FILE_WRITE_BINARY = 'file_write_binary',
  FILE_READ_BINARY = 'file_read_binary',
  DIRINFO_SYNC = 'dirinfo_sync',
  FILE_CHANGED = 'file_changed',
  AUTOMATE_RUN = 'automate_run',
  RESPONSE = 'response',
  ERROR = 'error',
}
