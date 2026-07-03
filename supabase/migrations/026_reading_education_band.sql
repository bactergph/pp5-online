-- Reading criteria per education band (ช่วงชั้นที่ 1-4).

update evaluation_settings
set education_band = '4'
where kind = 'reading' and education_band = '0';
