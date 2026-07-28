-- Sparse daily: present (ม) is default — remove stored present rows
delete from daily_attendance where status = 'ม';
