/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual.utils {
    // d3
    import Selection = d3.Selection;
    import LinearScale = d3.scale.Linear;
    import UpdateSelection = d3.selection.Update;

    // powerbi.extensibility.utils.chart
    import AxisHelper = powerbi.extensibility.utils.chart.axis;

    // powerbi.extensibility.utils.type
    import Double = powerbi.extensibility.utils.type.Double;

    // powerbi.extensibility.utils.type
    import Prototype = powerbi.extensibility.utils.type.Prototype;

    const PctRoundingError: number = 0.0001;
    const RectName: string = "rect";

    export const DimmedOpacity = 0.4;
    export const DefaultOpacity = 1.0;

    const DefaultNumberRange: NumberRange = {
        min: 0,
        max: 10
    };

    export function getSize(scale: LinearScale<any, any>, size: number, zeroVal: number = 0): number {
        return AxisHelper.diffScaled(scale, zeroVal, size);
    }

    export function calcValueDomain(data: MekkoChartSeries[], is100pct: boolean): NumberRange {
        if (data.length === 0) {
            return {
                min: DefaultNumberRange.min,
                max: DefaultNumberRange.max
            };
        }

        let min: number = d3.min<MekkoChartSeries, number>(
            data,
            (series: MekkoChartSeries) => {
                return d3.min<MekkoChartColumnDataPoint, number>(
                    series.data,
                    (dataPoint: MekkoChartColumnDataPoint) => {
                        return dataPoint.position - dataPoint.valueAbsolute;
                    });
            });

        let max: number = d3.max<MekkoChartSeries, number>(
            data,
            (series: MekkoChartSeries) => {
                return d3.max<MekkoChartColumnDataPoint, number>(
                    series.data,
                    (dataPoint: MekkoChartColumnDataPoint) => dataPoint.position);
            });

        if (is100pct) {
            min = Double.roundToPrecision(min, PctRoundingError);
            max = Double.roundToPrecision(max, PctRoundingError);
        }

        return {
            min,
            max
        };
    }

    export function drawSeries(
        data: MekkoChartData,
        graphicsContext: Selection<any>,
        axisOptions: MekkoChartAxisOptions): UpdateSelection<MekkoChartSeries> {

        const series: UpdateSelection<MekkoChartSeries> = graphicsContext
            .selectAll(MekkoChart.SeriesSelector.selectorName)
            .data(data.series, (series: MekkoChartSeries) => series.key);

        series
            .enter()
            .append("g")
            .classed(MekkoChart.SeriesSelector.className, true);

        series
            .style({
                fill: (series: MekkoChartSeries) => series.color,
            });

        series
            .exit()
            .remove();

        return series;
    }

    export function applyInteractivity(columns: Selection<any>, onDragStart): void {
        if (onDragStart) {
            columns
                .attr("draggable", "true")
                .on("dragstart", onDragStart);
        }
    }

    export function getFillOpacity(
        selected: boolean,
        highlight: boolean,
        hasSelection: boolean,
        hasPartialHighlights: boolean): number {

        if ((hasPartialHighlights && !highlight) || (hasSelection && !selected)) {
            return DimmedOpacity;
        }

        return DefaultOpacity;
    }

    export function setChosenColumnOpacity(
        mainGraphicsContext: Selection<any>,
        columnGroupSelector: string,
        selectedColumnIndex: number,
        lastColumnIndex: number): void {

        const series: Selection<any> = mainGraphicsContext
            .selectAll(MekkoChart.SeriesSelector.selectorName);

        const lastColumnUndefined: boolean = typeof lastColumnIndex === "undefined";

        series.selectAll(RectName + columnGroupSelector)
            .filter((dataPoint: MekkoChartColumnDataPoint) => {
                return (dataPoint.categoryIndex !== selectedColumnIndex)
                    && (lastColumnUndefined || dataPoint.categoryIndex === lastColumnIndex);
            })
            .transition()
            .style("fill-opacity", DimmedOpacity);

        series.selectAll(RectName + columnGroupSelector)
            .filter((dataPoint: MekkoChartColumnDataPoint) => {
                return dataPoint.categoryIndex === selectedColumnIndex;
            })
            .style("fill-opacity", DefaultOpacity);
    }

    export function getClosestColumnIndex(coordinate: number, columnsCenters: number[]): number {
        let currentIndex: number = 0,
            distance: number = Number.MAX_VALUE;

        for (let i: number = 0; i < columnsCenters.length; i++) {
            const currentDistance: number = Math.abs(coordinate - columnsCenters[i]);

            if (currentDistance < distance) {
                distance = currentDistance;
                currentIndex = i;
            }
        }

        return currentIndex;
    }

    export function applyUserMinMax(
        isScalar: boolean,
        dataView: DataViewCategorical,
        xAxisCardProperties: DataViewObject): DataViewCategorical {

        if (isScalar) {
            const min: DataViewPropertyValue = xAxisCardProperties["start"],
                max: DataViewPropertyValue = xAxisCardProperties["end"];

            return transformDomain(dataView, min, max);
        }

        return dataView;
    }

    export function transformDomain(
        dataView: DataViewCategorical,
        min: DataViewPropertyValue,
        max: DataViewPropertyValue): DataViewCategorical {

        if (!dataView.categories
            || !dataView.values
            || dataView.categories.length === 0
            || dataView.values.length === 0) {

            return dataView;
        }

        if (typeof min !== "number" && typeof max !== "number") {
            return dataView;
        }

        const category: DataViewCategoryColumn = dataView.categories[0];

        const categoryType: ValueTypeDescriptor = category
            ? category.source.type
            : null;

        // Min/Max comparison won't work if category source is Ordinal
        if (AxisHelper.isOrdinal(categoryType)) {
            return;
        }

        const categoryValues: PrimitiveValue[] = category.values,
            categoryObjects: DataViewObjects[] = category.objects;

        if (!categoryValues || !categoryObjects) {
            return dataView;
        }

        const newcategoryValues: PrimitiveValue[] = [],
            newValues: PrimitiveValue[][] = [],
            newObjects: DataViewObjects[] = [];

        if (typeof min !== "number") {
            min = categoryValues[0];
        }
        if (typeof max !== "number") {
            max = categoryValues[categoryValues.length - 1];
        }

        if (min > max) {
            return dataView;
        }

        for (let j: number = 0; j < dataView.values.length; j++) {
            newValues.push([]);
        }

        for (let t: number = 0; t < categoryValues.length; t++) {
            if (categoryValues[t] >= min && categoryValues[t] <= max) {
                newcategoryValues.push(categoryValues[t]);

                if (categoryObjects) {
                    newObjects.push(categoryObjects[t]);
                }

                if (dataView.values) {
                    for (let k: number = 0; k < dataView.values.length; k++) {
                        newValues[k].push(dataView.values[k].values[t]);
                    }
                }
            }
        }

        const resultDataView: DataViewCategorical = Prototype.inherit(dataView),
            resultDataViewValues: DataViewValueColumns
                = resultDataView.values
                = Prototype.inherit(resultDataView.values),
            resultDataViewCategories: DataViewCategoryColumn[]
                = resultDataView.categories
                = Prototype.inherit(dataView.categories),
            resultDataViewCategories0: DataViewCategoryColumn
                = resultDataView.categories[0]
                = Prototype.inherit(resultDataViewCategories[0]);

        resultDataViewCategories0.values = newcategoryValues;

        if (resultDataViewCategories0.objects) {
            resultDataViewCategories0.objects = newObjects;
        }

        for (let t: number = 0; t < dataView.values.length; t++) {
            const measureArray: DataViewValueColumn
                = resultDataViewValues[t]
                = Prototype.inherit(resultDataViewValues[t]);

            measureArray.values = newValues[t];
        }

        return resultDataView;
    }
}
