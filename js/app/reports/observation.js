		(function () {
			define(["jquery", "d3", "jnj/chart", "common", "datatables"], function ($, d3, jnj_chart, common) {
				var observation_report = {};
				var threshold;

				// bind to all matching elements upon creation
				$(document).on('click', '#observation_table tbody tr', function () {
					id = $($(this).children()[0]).text();
					concept_name = $($(this).children()[4]).text();
					observation_report.drilldown(id, concept_name);
				});

				$('#myTab a').click(function (e) {
					e.preventDefault();
					$(this).tab('show');
					$(window).trigger("resize");
				})

				observation_report.drilldown = function (concept_id, concept_name) {
					$('.drilldown svg').remove();
					$('#observationDrilldownTitle').text(concept_name);
					$('#reportObservationDrilldown').removeClass('hidden');

					$.ajax({
						type: "GET",
						url: 'data/' + page_vm.datasource().folder + '/observations/observation_' + concept_id + '.json',
						success: function (data) {
							// age at first diagnosis visualization
							var ageAtFirstOccurrence = new jnj_chart.boxplot();
							bpseries = [];
							bpdata = data.AGE_AT_FIRST_OCCURRENCE;
							for (i = 0; i < bpdata.CATEGORY.length; i++) {
								bpseries.push({
									Category: bpdata.CATEGORY[i],
									min: bpdata.MIN_VALUE[i],
									max: bpdata.MAX_VALUE[i],
									median: bpdata.MEDIAN_VALUE[i],
									LIF: bpdata.P10_VALUE[i],
									q1: bpdata.P25_VALUE[i],
									q3: bpdata.P75_VALUE[i],
									UIF: bpdata.P90_VALUE[i]
								});
							}
							ageAtFirstOccurrence.render(bpseries, "#reportObservations #ageAtFirstOccurrence", 500, 300, {
								xLabel: 'Gender',
								yLabel: 'Age at First Occurrence'
							});

							// prevalence by month
							var byMonthSeries = common.mapMonthYearDataToSeries(data.PREVALENCE_BY_MONTH, {
								dateField: 'X_CALENDAR_MONTH',
								yValue: 'Y_PREVALENCE_1000PP',
								yPercent: 'Y_PREVALENCE_1000PP'
							});

							var prevalenceByMonth = new jnj_chart.line();
							prevalenceByMonth.render(byMonthSeries, "#reportObservations #observationPrevalenceByMonth", 1000, 300, {
								xScale: d3.time.scale().domain(d3.extent(byMonthSeries[0].values, function (d) {
									return d.xValue;
								})),
								tickFormat: function (d) { 
									var monthFormat = d3.time.format("%m/%Y");
									var yearFormat = d3.time.format("%Y");
									return (d.getMonth() == 0) ? yearFormat(d) : monthFormat(d);
								},
								tickPadding: 10,
								margin: {
									top: 5,
									right: 25,
									bottom: 5,
									left: 40
								},
								xLabel: "Date",
								yLabel: "Prevalence per 1000 People"
							});

							// observation type visualization
							var observationsByType = new jnj_chart.donut();
							dataObservationsByType = [];

							if (data.OBSERVATIONS_BY_TYPE.CONCEPT_NAME instanceof Array)
							{
								dataObservationsByType = data.OBSERVATIONS_BY_TYPE.CONCEPT_NAME.map(function (d,i){
									var item = 
									{
										id: this.CONCEPT_NAME[i],
										label: this.CONCEPT_NAME[i],
										value: this.COUNT_VALUE[i]
									};
									return item;
								}, data.OBSERVATIONS_BY_TYPE);																						
							}
							else
							{
								dataObservationsByType.push(
								{
									id: data.OBSERVATIONS_BY_TYPE.CONCEPT_NAME,
									label: data.OBSERVATIONS_BY_TYPE.CONCEPT_NAME,
									value: data.OBSERVATIONS_BY_TYPE.COUNT_VALUE
								});
							}
									
							dataObservationsByType.sort(function (a, b) {
								var nameA = a.label.toLowerCase(),
									nameB = b.label.toLowerCase()
								if (nameA < nameB) //sort string ascending
									return -1
								if (nameA > nameB)
									return 1
								return 0 //default return value (no sorting)
							});

							observationsByType.render(dataObservationsByType, "#reportObservations #observationsByType", 500, 300, {
								margin: {
									top: 5,
									left: 5,
									right: 220,
									bottom: 5
								}
							});

							// render trellis
							trellisData = data.PREVALENCE_BY_GENDER_AGE_YEAR;

							var allDeciles = ["00-09", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-99"];
							var allSeries = ["MALE", "FEMALE"];
							var minYear = d3.min(trellisData.X_CALENDAR_YEAR),
								maxYear = d3.max(trellisData.X_CALENDAR_YEAR);

							var seriesInitializer = function (tName, sName, x, y) {
								return {
									TRELLIS_NAME: tName,
									SERIES_NAME: sName,
									X_CALENDAR_YEAR: x,
									Y_PREVALENCE_1000PP: y
								};
							}

							var nestByDecile = d3.nest()
								.key(function (d) {
									return d.TRELLIS_NAME;
								})
								.key(function (d) {
									return d.SERIES_NAME;
								})
								.sortValues(function (a, b) {
									return a.X_CALENDAR_YEAR - b.X_CALENDAR_YEAR;
								});

							// map data into chartable form
							var normalizedSeries = trellisData.TRELLIS_NAME.map(function (d, i) {
								var item = {};
								var container = this;
								d3.keys(container).forEach(function (p) {
									item[p] = container[p][i];
								});
								return item;
							}, trellisData);

							var dataByDecile = nestByDecile.entries(normalizedSeries);
							// fill in gaps
							var yearRange = d3.range(minYear, maxYear, 1);

							dataByDecile.forEach(function (trellis) {
								trellis.values.forEach(function (series) {
									series.values = yearRange.map(function (year) {
										yearData = series.values.filter(function (f) {
											return f.X_CALENDAR_YEAR == year;
										})[0] || seriesInitializer(trellis.key, series.key, year, 0);
										yearData.date = new Date(year, 0, 1);
										return yearData;
									})
								})
							});

							// create svg with range bands based on the trellis names
							var chart = new jnj_chart.trellisline();
							chart.render(dataByDecile, "#reportObservations #trellisLinePlot", 1000, 300, {
								trellisSet: allDeciles,
								trellisLabel: "Age Decile",
								seriesLabel: "Year of Observation",
								yLabel: "Prevalence Per 1000 People",
								xFormat: d3.time.format("%Y"),
								yFormat: d3.format("0.2f"),
								tickPadding: 20,
								colors: d3.scale.ordinal()
									.domain(["MALE", "FEMALE"])
									.range(["#1f77b4", "#ff7f0e"])						

							});
							
							// Records by Unit
							var recordsByUnit = new jnj_chart.donut();
							datdaRecordsByUnit = [];

							if (data.RECORDS_BY_UNIT.CONCEPT_NAME instanceof Array)
							{
								datdaRecordsByUnit = data.RECORDS_BY_UNIT.CONCEPT_NAME.map(function (d,i){
									var item = 
									{
										id: this.CONCEPT_NAME[i],
										label: this.CONCEPT_NAME[i],
										value: this.COUNT_VALUE[i]
									};
									return item;
								}, data.RECORDS_BY_UNIT);																						
							}
							else
							{
								datdaRecordsByUnit.push(
								{
									id: data.RECORDS_BY_UNIT.CONCEPT_NAME,
									label: data.RECORDS_BY_UNIT.CONCEPT_NAME,
									value: data.RECORDS_BY_UNIT.COUNT_VALUE
								});
							}
									
							datdaRecordsByUnit.sort(function (a, b) {
								var nameA = a.label.toLowerCase(),
									nameB = b.label.toLowerCase()
								if (nameA < nameB) //sort string ascending
									return -1
								if (nameA > nameB)
									return 1
								return 0 //default return value (no sorting)
							});

							recordsByUnit.render(datdaRecordsByUnit, "#reportObservations #recordsByUnit", 500, 300, {
								margin: {
									top: 5,
									left: 5,
									right: 200,
									bottom: 5
								}
							});
							
							// Observation Value Distribution
							var observationValues = new jnj_chart.boxplot();
							bpseries = [];
							bpdata = data.OBSERVATION_VALUE_DISTRIBUTION;
							if (bpdata.CATEGORY instanceof Array)
							{
								bpseries = bpdata.CATEGORY.map(function (d,i)
								{
									var item = 
									{
										Category: bpdata.CATEGORY[i],
										min: bpdata.MIN_VALUE[i],
										max: bpdata.MAX_VALUE[i],
										median: bpdata.MEDIAN_VALUE[i],
										LIF: bpdata.P10_VALUE[i],
										q1: bpdata.P25_VALUE[i],
										q3: bpdata.P75_VALUE[i],
										UIF: bpdata.P90_VALUE[i]									
									};
									return item;
								},bpdata);
								
							}
							else
							{
								bpseries.push({
									Category: bpdata.CATEGORY,
									min: bpdata.MIN_VALUE,
									max: bpdata.MAX_VALUE,
									median: bpdata.MEDIAN_VALUE,
									LIF: bpdata.P10_VALUE,
									q1: bpdata.P25_VALUE,
									q3: bpdata.P75_VALUE,
									UIF: bpdata.P90_VALUE
								});								
							}

							observationValues.render(bpseries, "#reportObservations #observationValues", 500, 300, {
								yMax: d3.max(bpdata.P90_VALUE) || bpdata.P90_VALUE, // handle when dataframe is not array of values
								xLabel: 'Unit',
								yLabel: 'Observation Value'
							});
							
							// Lower Limit Distribution
							var lowerLimit = new jnj_chart.boxplot();
							bpseries = [];
							bpdata = data.LOWER_LIMIT_DISTRIBUTION;
							if (bpdata.CATEGORY instanceof Array)
							{
								bpseries = bpdata.CATEGORY.map(function (d,i)
								{
									var item = 
									{
										Category: bpdata.CATEGORY[i],
										min: bpdata.MIN_VALUE[i],
										max: bpdata.MAX_VALUE[i],
										median: bpdata.MEDIAN_VALUE[i],
										LIF: bpdata.P10_VALUE[i],
										q1: bpdata.P25_VALUE[i],
										q3: bpdata.P75_VALUE[i],
										UIF: bpdata.P90_VALUE[i]									
									};
									return item;
								},bpdata);
								
							}
							else
							{
								bpseries.push({
									Category: bpdata.CATEGORY,
									min: bpdata.MIN_VALUE,
									max: bpdata.MAX_VALUE,
									median: bpdata.MEDIAN_VALUE,
									LIF: bpdata.P10_VALUE,
									q1: bpdata.P25_VALUE,
									q3: bpdata.P75_VALUE,
									UIF: bpdata.P90_VALUE
								});								
							}

							lowerLimit.render(bpseries, "#reportObservations #lowerLimit", 300, 200, {
								yMax: d3.max(bpdata.P90_VALUE) || bpdata.P90_VALUE, // handle when dataframe is not array of values
								xLabel: 'Unit',
								yLabel: 'Observation Value'
							});
							
							// Upper Limit Distribution
							var upperLimit = new jnj_chart.boxplot();
							bpseries = [];
							bpdata = data.UPPER_LIMIT_DISTRIBUTION;
							if (bpdata.CATEGORY instanceof Array)
							{
								bpseries = bpdata.CATEGORY.map(function (d,i)
								{
									var item = 
									{
										Category: bpdata.CATEGORY[i],
										min: bpdata.MIN_VALUE[i],
										max: bpdata.MAX_VALUE[i],
										median: bpdata.MEDIAN_VALUE[i],
										LIF: bpdata.P10_VALUE[i],
										q1: bpdata.P25_VALUE[i],
										q3: bpdata.P75_VALUE[i],
										UIF: bpdata.P90_VALUE[i]									
									};
									return item;
								},bpdata);
								
							}
							else
							{
								bpseries.push({
									Category: bpdata.CATEGORY,
									min: bpdata.MIN_VALUE,
									max: bpdata.MAX_VALUE,
									median: bpdata.MEDIAN_VALUE,
									LIF: bpdata.P10_VALUE,
									q1: bpdata.P25_VALUE,
									q3: bpdata.P75_VALUE,
									UIF: bpdata.P90_VALUE
								});								
							}

							upperLimit.render(bpseries, "#reportObservations #upperLimit", 300, 200, {
								yMax: d3.max(bpdata.P90_VALUE) || bpdata.P90_VALUE, // handle when dataframe is not array of values
								xLabel: 'Unit',
								yLabel: 'Observation Value'
							});							
							
							// relative to norm pie
							var relativeToNorm = new jnj_chart.donut();
							dataRelativeToNorm = [];

							if (data.VALUES_RELATIVE_TO_NORM.CONCEPT_NAME instanceof Array)
							{
								dataRelativeToNorm = data.VALUES_RELATIVE_TO_NORM.CONCEPT_NAME.map(function (d,i){
									var item = 
									{
										id: this.CONCEPT_NAME[i],
										label: this.CONCEPT_NAME[i],
										value: this.COUNT_VALUE[i]
									};
									return item;
								}, data.VALUES_RELATIVE_TO_NORM);																						
							}
							else
							{
								dataRelativeToNorm.push(
								{
									id: data.VALUES_RELATIVE_TO_NORM.CONCEPT_NAME,
									label: data.VALUES_RELATIVE_TO_NORM.CONCEPT_NAME,
									value: data.VALUES_RELATIVE_TO_NORM.COUNT_VALUE
								});
							}
									
							dataRelativeToNorm.sort(function (a, b) {
								var nameA = a.label.toLowerCase(),
									nameB = b.label.toLowerCase()
								if (nameA < nameB) //sort string ascending
									return -1
								if (nameA > nameB)
									return 1
								return 0 //default return value (no sorting)
							});

							relativeToNorm.render(dataRelativeToNorm, "#reportObservations #relativeToNorm", 500, 300, {
								margin: {
									top: 5,
									left: 5,
									right: 200,
									bottom: 5
								}
							});							
						}
					});
				}

				observation_report.render = function (folder) {
					format_pct = d3.format('.2%');
					format_fixed = d3.format('.2f');
					format_comma = d3.format(',');

					$('#reportObservations svg').remove();

					width = 1000;
					height = 250;
					minimum_area = 50;
					threshold = minimum_area / (width * height);

					$.ajax({
						type: "GET",
						url: 'data/' + folder + '/observation_treemap.json',
						contentType: "application/json; charset=utf-8",
						success: function (data) {
							table_data = data.CONCEPT_PATH.map(function (d, i) {
								conceptDetails = this.CONCEPT_PATH[i].split('||');
								return {
									concept_id: this.CONCEPT_ID[i],
									level_4: conceptDetails[0],
									level_3: conceptDetails[1],
									level_2: conceptDetails[2],
									observation_name: conceptDetails[3],
									num_persons: format_comma(this.NUM_PERSONS[i]),
									percent_persons: format_pct(this.PERCENT_PERSONS[i]),
									records_per_person: format_fixed(this.RECORDS_PER_PERSON[i])
								}
							}, data);

							$('#observation_table').dataTable({
								data: table_data,
								columns: [
									{
										data: 'concept_id'
									},
									{
										data: 'level_4'
									},
									{
										data: 'level_3'
									},
									{
										data: 'level_2'
									},
									{
										data: 'observation_name'
									},
									{
										data: 'num_persons',
										className: 'numeric'
									},
									{
										data: 'percent_persons',
										className: 'numeric'
									},
									{
										data: 'records_per_person',
										className: 'numeric'
									}
								],
								pageLength: 5,
								lengthChange: false,
								deferRender: true,
								destroy: true
							});

							$('#reportObservations').show();

							tree = buildHierarchyFromJSON(data, threshold);
							var treemap = new jnj_chart.treemap();
							treemap.render(tree, '#reportObservations #treemap_container', width, height, {
								onclick: function (node) {
									observation_report.drilldown(node.id, node.name)
								},
								getsizevalue: function (node) {
									return node.num_persons;
								},
								getcolorvalue: function (node) {
									return node.records_per_person;
								},
								gettitle: function (node) {
									title = '';
									steps = node.path.split('||');
									for (i = 0; i < steps.length; i++) {
										if (i == steps.length - 1) {
											title += '<hr class="path">';
											title += '<div class="pathleaf">' + steps[i] + '</div>';
											title += '<div class="pathleafstat">Prevalence: ' + format_pct(node.pct_persons) + '</div>';
											title += '<div class="pathleafstat">Number of People: ' + format_comma(node.num_persons) + '</div>';
											title += '<div class="pathleafstat">Records per Person: ' + format_fixed(node.records_per_person) + '</div>';
										} else {
											title += ' <div class="pathstep">' + Array(i + 1).join('&nbsp;&nbsp') + steps[i] + ' </div>';
										}
									}
									return title;
								}
							});
						}

					});
				}

				function buildHierarchyFromJSON(data, threshold) {
					var total = 0;

					var root = {
						"name": "root",
						"children": []
					};

					for (i = 0; i < data.PERCENT_PERSONS.length; i++) {
						total += data.PERCENT_PERSONS[i];
					}

					for (var i = 0; i < data.CONCEPT_PATH.length; i++) {
						var parts = data.CONCEPT_PATH[i].split("||");
						var currentNode = root;
						for (var j = 0; j < parts.length; j++) {
							var children = currentNode["children"];
							var nodeName = parts[j];
							var childNode;
							if (j + 1 < parts.length) {
								// Not yet at the end of the path; move down the tree.
								var foundChild = false;
								for (var k = 0; k < children.length; k++) {
									if (children[k]["name"] == nodeName) {
										childNode = children[k];
										foundChild = true;
										break;
									}
								}
								// If we don't already have a child node for this branch, create it.
								if (!foundChild) {
									childNode = {
										"name": nodeName,
										"children": []
									};
									children.push(childNode);
								}
								currentNode = childNode;
							} else {
								// Reached the end of the path; create a leaf node.
								childNode = {
									"name": nodeName,
									"num_persons": data.NUM_PERSONS[i],
									"id": data.CONCEPT_ID[i],
									"path": data.CONCEPT_PATH[i],
									"pct_persons": data.PERCENT_PERSONS[i],
									"records_per_person": data.RECORDS_PER_PERSON[i]
								};

								// we only include nodes with sufficient size in the treemap display
								// sufficient size is configurable in the calculation of threshold
								// which is a function of the number of pixels in the treemap display
								if ((data.PERCENT_PERSONS[i] / total) > threshold) {
									children.push(childNode);
								}
							}
						}
					}
					return root;
				};
				return observation_report;
			});
		})();
