const { buildHoursLabelsWithOptional30 } = require('./src/utils/scheduleHours');
console.log(buildHoursLabelsWithOptional30(7, 11, [{startTime:'07:00', endTime:'07:30'}]));
