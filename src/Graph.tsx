
import { Component, CSSProperties } from 'react';
import { Canvas } from './Canvas';

type Rect = {
	left: number
	top: number
	right: number
	bottom: number
};


type LabelFillStyle = string | CanvasGradient | CanvasPattern;
type LabelProps = {
	labelFont?: string
	labelTextBaseline?: CanvasTextBaseline
	labelTextAlign?: CanvasTextAlign
	labelFillStyle?: LabelFillStyle
	minLabelInterval?: number
	labelOffsetX?: number
	labelOffsetY?: number
};

type PointLabelTextGetter = (args: {index: number, x: number, y: number}) => string;
type PointLabelProps = LabelProps & {
	getLabelText?: PointLabelTextGetter
};

type ValueLabelTextGetter = (args: {index: number, val: number}) => string;


type LineStyle = {
	lineWidth?: number
	strokeStyle?: string

	fill?: boolean
	fillStyle?: string

	showDots?: boolean
	dotsFillStyle?: string
	dotRadius?: number

	showLabels?: boolean
} & PointLabelProps;

export type LineData = {
	points?: [number,number][]
	pointGroups?: Array<[number,number][]>
	displayName?: string
} & LineStyle;


type Axis = 'x' | 'y';
type AxisLineLabelPosition = 'min' | 'max' | 'center';
type AxisLineStyle = {
	lineWidth?: number
	lineInsetMin?: number
	lineInsetMax?: number
	strokeStyle?: string

	showLabels?: boolean
	labelPosition?: AxisLineLabelPosition
	getLabelText?: ValueLabelTextGetter
} & LabelProps;

export type AxisLineData = {
	points: number[]
	axis: Axis
} & AxisLineStyle;



type Props = {
	lines?: LineData[]
	axisLines?: AxisLineData[]

	xMin?: number
	xMax?: number
	yMin?: number
	yMax?: number
	dataPaddingX?: [number, number] | number
	dataPaddingY?: [number, number] | number
	gridSpacingX?: number | null
	gridSpacingY?: number | null
	
	width: number
	height: number
	paddingLeft?: number
	paddingRight?: number
	paddingTop?: number
	paddingBottom?: number
	gridStrokeStyle?: string
	backgroundFillStyle?: string

	style?: CSSProperties
};

type State = {
	//
};



type LayoutProps = {
	dataRangeX: [number,number]
	dataRangeY: [number,number]
	rect: Rect
};

type DataRangeXY = {
	x: [number,number] | undefined
	y: [number,number] | undefined
};



// credit to https://github.com/MatthewCallis/Canvas-Graphs which was used as reference while writing this

export class Graph extends Component<Props,State> {
	constructor(props: Props) {
		super(props);
	}

	expandDataRange(dataRange: DataRangeXY, newDataRange: DataRangeXY) {
		if(newDataRange.x) {
			if(dataRange.x) {
				if(newDataRange.x[0] < dataRange.x[0]) {
					dataRange.x[0] = newDataRange.x[0];
				}
				if(newDataRange.x[1] > dataRange.x[1]) {
					dataRange.x[1] = newDataRange.x[1];
				}
			} else {
				dataRange.x = newDataRange.x;
			}
		}
		if(newDataRange.y) {
			if(dataRange.y) {
				if(newDataRange.y[0] < dataRange.y[0]) {
					dataRange.y[0] = newDataRange.y[0];
				}
				if(newDataRange.y[1] > dataRange.y[1]) {
					dataRange.y[1] = newDataRange.y[1];
				}
			} else {
				dataRange.y = newDataRange.y;
			}
		}
	}

	calculateLayoutProps(props: Props): LayoutProps {
		const { lines, axisLines, width, height,
			dataPaddingX, dataPaddingY,
			paddingLeft, paddingRight, paddingTop, paddingBottom } = props;
		let { xMin, xMax, yMin, yMax } = props;
		// calculate graph rect
		const rect: Rect = {
			left: (paddingLeft ?? 0),
			top: (paddingTop ?? 0),
			right: (width - (paddingRight ?? 0)),
			bottom: (height - (paddingBottom ?? 0))
		};
		// calculate padding values
		if(xMin == null || xMax == null || yMin == null || yMax == null) {
			let xMinPadding = 0;
			let xMaxPadding = 0;
			if(typeof dataPaddingX == 'number') {
				xMinPadding = dataPaddingX;
				xMaxPadding = dataPaddingX;
			} else if(dataPaddingX) {
				xMinPadding = dataPaddingX[0];
				xMaxPadding = dataPaddingX[1];
			}
			let yMinPadding = 0;
			let yMaxPadding = 1;
			if(typeof dataPaddingY == 'number') {
				yMinPadding = dataPaddingY;
				yMaxPadding = dataPaddingY;
			} else if(dataPaddingY) {
				yMinPadding = dataPaddingY[0];
				yMaxPadding = dataPaddingY[1];
			}
			// calculate visible range of data
			const dataRange: DataRangeXY = {
				x: undefined,
				y: undefined
			};
			if(lines) {
				const lineDataRange = this.calculateLineDataRange(lines);
				this.expandDataRange(dataRange, lineDataRange);
			}
			if(axisLines) {
				const axisLineDataRange = this.calculateAxisLineDataRange(axisLines);
				this.expandDataRange(dataRange, axisLineDataRange);
			}
			// update min and max with data range if needed
			if(dataRange.x) {
				if(xMin == null) {
					if(xMax != null && xMax < dataRange.x[0]) {
						xMin = xMax - xMinPadding;
					} else {
						xMin = dataRange.x[0] - xMinPadding;
					}
				}
				if(xMax == null) {
					if(xMin != null && xMin > dataRange.x[1]) {
						xMax = xMin + xMaxPadding;
					} else {
						xMax = dataRange.x[1] + xMaxPadding;
					}
				}
			} else {
				if(xMin == null) {
					if(xMax == null) {
						xMin = 0;
					} else {
						xMin = xMax - xMinPadding;
					}
				}
				if(xMax == null) {
					xMax = xMin + xMaxPadding;
				}
			}
			if(dataRange.y) {
				if(yMin == null) {
					if(yMax != null && yMax < dataRange.y[0]) {
						yMin = yMax - yMinPadding;
					} else {
						yMin = dataRange.y[0] - yMinPadding;
					}
				}
				if(yMax == null) {
					if(yMin != null && yMin > dataRange.y[1]) {
						yMax = yMin + yMaxPadding;
					} else {
						yMax = dataRange.y[1] + yMaxPadding;
					}
				}
			} else {
				if(yMin == null) {
					if(yMax == null) {
						yMin = 0;
					} else {
						yMin = yMax - yMaxPadding;
					}
				}
				if(yMax == null) {
					yMax = yMin + yMaxPadding;
				}
			}
		}
		return {
			dataRangeX: [xMin,xMax],
			dataRangeY: [yMin,yMax],
			rect
		};
	}

	calculateLineDataRange(lines: LineData[]): DataRangeXY {
		const dataRange: DataRangeXY = {
			x: undefined,
			y: undefined
		};
		for(const lineData of lines) {
			const { points, pointGroups } = lineData;
			if(points) {
				for(const point of points) {
					const px = point[0];
					const py = point[1];
					if(dataRange.x) {
						if(px < dataRange.x[0]) {
							dataRange.x[0] = px;
						} else if(px > dataRange.x[1]) {
							dataRange.x[1] = px;
						}
					} else {
						dataRange.x = [px, px];
					}
					if(dataRange.y) {
						if(py < dataRange.y[0]) {
							dataRange.y[0] = py;
						} else if(py > dataRange.y[1]) {
							dataRange.y[1] = py;
						}
					} else {
						dataRange.y = [py, py];
					}
				}
			}
			if(pointGroups) {
				for(const group of pointGroups) {
					for(const point of group) {
						const px = point[0];
						const py = point[1];
						if(dataRange.x) {
							if(px < dataRange.x[0]) {
								dataRange.x[0] = px;
							} else if(px > dataRange.x[1]) {
								dataRange.x[1] = px;
							}
						} else {
							dataRange.x = [px, px];
						}
						if(dataRange.y) {
							if(py < dataRange.y[0]) {
								dataRange.y[0] = py;
							} else if(py > dataRange.y[1]) {
								dataRange.y[1] = py;
							}
						} else {
							dataRange.y = [py, py];
						}
					}
				}
			}
		}
		return dataRange;
	}

	calculateAxisLineDataRange(axisLines: AxisLineData[]): DataRangeXY {
		const dataRange: DataRangeXY = {
			x: undefined,
			y: undefined
		};
		for(const axisLineData of axisLines) {
			const { axis, points } = axisLineData;
			if(points) {
				switch(axis) {
					case 'x': {
						for(const px of points) {
							if(dataRange.x) {
								if(px < dataRange.x[0]) {
									dataRange.x[0] = px;
								} else if(px > dataRange.x[1]) {
									dataRange.x[1] = px;
								}
							} else {
								dataRange.x = [px, px];
							}
						}
					} break;

					case 'y': {
						for(const py of points) {
							if(dataRange.y) {
								if(py < dataRange.y[0]) {
									dataRange.y[0] = py;
								} else if(py > dataRange.y[1]) {
									dataRange.y[1] = py;
								}
							} else {
								dataRange.y = [py, py];
							}
						}
					} break;

					default:
						console.error("Invalid 'axis' prop "+axis);
						break;
				}
			}
		}
		return dataRange;
	}

	calculateCanvasPointX(dataPointX: number, dataRangeXMin: number, dataWidth: number, graphXMin: number, graphWidth: number): number {
		return graphXMin + (((dataPointX - dataRangeXMin) / dataWidth) * graphWidth);
	}
	calculateCanvasPointY(dataPointY: number, dataRangeYMin: number, dataHeight: number, graphYMin: number, graphHeight: number): number {
		return graphYMin + (graphHeight - ((dataPointY - dataRangeYMin) / dataHeight) * graphHeight);
	}
	calculateCanvasPoint(dataPoint: [number,number], {dataRangeX, dataRangeY, rect}: LayoutProps): [number,number] {
		return [
			this.calculateCanvasPointX(dataPoint[0], dataRangeX[0], (dataRangeX[1] - dataRangeX[0]), rect.left, (rect.right - rect.left)),
			this.calculateCanvasPointY(dataPoint[1], dataRangeY[0], (dataRangeY[1] - dataRangeY[0]), rect.top, (rect.bottom - rect.top))
		];
	}



	draw(context: CanvasRenderingContext2D) {
		// get props
		const props = this.props;
		const {
			lines, axisLines,
			gridSpacingX, gridSpacingY,
			backgroundFillStyle, gridStrokeStyle,
			 } = this.props;
		const layoutProps = this.calculateLayoutProps(props);
		const { rect } = layoutProps;

		// draw background
		if(backgroundFillStyle) {
			context.save();
			context.fillStyle = backgroundFillStyle;
			context.fillRect(
				rect.left,
				rect.top,
				rect.right-layoutProps.rect.left,
				rect.bottom-layoutProps.rect.top);
			context.restore();
		}
		
		// draw grid
		if(gridSpacingX || gridSpacingY) {
			context.save();
			context.strokeStyle = gridStrokeStyle ?? 'lightgray';
			this.drawGrid(context, layoutProps, gridSpacingX, gridSpacingY);
			context.restore();
		}

		// draw lines if available
		if(lines) {
			// draw each line
			for(const lineData of lines) {
				const { points, pointGroups } = lineData;
				// draw single "points" array for line
				if(points && points.length > 0) {
					const canvasPoints: [number,number][] = [];
					for(const point of points) {
						const canvasPoint: [number,number] = this.calculateCanvasPoint(point, layoutProps);
						canvasPoints.push(canvasPoint);
					}
					this.drawLinePointGroup(context, rect, lineData, points, canvasPoints);
				}
				// draw all point groups for line
				if(pointGroups && pointGroups.length > 0) {
					for(const group of pointGroups) {
						const canvasPoints: [number,number][] = [];
						for(const point of group) {
							const canvasPoint: [number,number] = this.calculateCanvasPoint(point, layoutProps);
							canvasPoints.push(canvasPoint);
						}
						this.drawLinePointGroup(context, rect, lineData, group, canvasPoints);
					}
				}
			}
		}
		// draw axis lines if available
		if(axisLines) {
			// draw each axis line
			for(const axisLineData of axisLines) {
				this.drawAxisLinesGroup(context, axisLineData, layoutProps);
			}
		}
	}



	drawGrid(context: CanvasRenderingContext2D, layoutProps: LayoutProps, gridSpacingX: number | null | undefined, gridSpacingY: number | null | undefined) {
		if(!gridSpacingX && !gridSpacingY) {
			return;
		}
		const { rect, dataRangeX, dataRangeY } = layoutProps;
		context.beginPath();
		if(gridSpacingX) {
			const graphWidth = rect.right - rect.left;
			const dataWidth = dataRangeX[1] - dataRangeX[0];
			const gridSpacingX_canvas = (gridSpacingX / dataWidth) * graphWidth;
			if(gridSpacingX_canvas > 0){
				for (let x=rect.left; x<=rect.right; x+=gridSpacingX_canvas){
					context.moveTo(x, rect.top);
					context.lineTo(x, rect.bottom);
				}
			}
		}
		if(gridSpacingY) {
			const graphHeight = rect.bottom - rect.top;
			const dataHeight = dataRangeY[1] - dataRangeY[0];
			const gridSpacingY_canvas = (gridSpacingY / dataHeight) * graphHeight;
			if(gridSpacingY_canvas > 0){
				for (var y=rect.bottom; y>=rect.top; y-=gridSpacingY_canvas){
					context.moveTo(rect.left, y);
					context.lineTo(rect.right, y);
				}
			}
		}
		context.stroke();
		context.closePath();
	}

	drawLabel(context: CanvasRenderingContext2D, text: string, canvasPoint: [number,number], labelProps: LabelProps) {
		context.save();
		if(labelProps.labelTextAlign) {
			context.textAlign = labelProps.labelTextAlign;
		}
		if(labelProps.labelTextBaseline) {
			context.textBaseline = labelProps.labelTextBaseline;
		}
		if(labelProps.labelFont) {
			context.font = labelProps.labelFont;
		}
		if(labelProps.labelFillStyle) {
			context.fillStyle = labelProps.labelFillStyle;
		}
		const labelX = canvasPoint[0] + (labelProps.labelOffsetX ?? 0);
		const labelY = canvasPoint[1] + (labelProps.labelOffsetY ?? 0);
		context.fillText(text, labelX, labelY);
		context.restore();
	}



	drawLinePointGroup(context: CanvasRenderingContext2D, rect: Rect, lineStyle: LineStyle, dataPoints: [number,number][], canvasPoints: [number,number][]) {
		context.save();
		context.strokeStyle = lineStyle.strokeStyle ?? 'black';
		context.lineWidth = lineStyle.lineWidth ?? 1;
		this.drawLine(context, dataPoints, canvasPoints);
		if(lineStyle.fill ?? false) {
			context.fillStyle = lineStyle.fillStyle ?? 'rgba(140,140,140,0.5)';
			this.drawFill(context, rect, dataPoints, canvasPoints);
		}
		if(lineStyle.showDots ?? true) {
			context.fillStyle = lineStyle.dotsFillStyle ?? 'black';
			this.drawDots(context, canvasPoints, lineStyle.dotRadius ?? 3);
		}
		const showLabels = lineStyle.showLabels ?? (lineStyle.getLabelText != null);
		if(showLabels) {
			this.drawPointLabels(context, dataPoints, canvasPoints, lineStyle);
		}
		context.restore();
	}

	drawLine(context: CanvasRenderingContext2D, dataPoints: [number,number][], canvasPoints: [number,number][]) {
		console.assert(dataPoints.length == canvasPoints.length);
		const pointsCount = dataPoints.length;
		if(pointsCount == 0) {
			return;
		}
		context.beginPath();
		const lineWidthOffset = ((context.lineWidth + 1) % 2) / 2;
		let prevDataPoint: [number,number] | undefined = undefined;
		let i=0;
		for(const dataPoint of dataPoints) {
			const canvasPoint = canvasPoints[i];
			if(!prevDataPoint || dataPoint[0] < prevDataPoint[0]) {
				// since we have no previous point, or this point is before the previous point, start a new line
				context.moveTo(canvasPoint[0] + lineWidthOffset, canvasPoint[1]);
			} else {
				// draw a line to this new point
				context.lineTo(canvasPoint[0] + lineWidthOffset, canvasPoint[1]);
			}
			prevDataPoint = dataPoint;
			i++;
		}
		context.stroke();
		context.closePath();
	}

	drawFill(context: CanvasRenderingContext2D, rect: Rect, dataPoints: [number,number][], canvasPoints: [number,number][]) {
		if(dataPoints.length == 0) {
			return;
		}
		context.beginPath();
		let firstCanvasPoint: [number,number] | undefined = undefined;
		let prevCanvasPoint: [number,number] | undefined = undefined;
		let prevDataPoint: [number,number] | undefined = undefined;
		let lowestCanvasY: number = rect.bottom;
		const finishLastSection = () => {
			const p0 = firstCanvasPoint as [number,number];
			const p1 = prevCanvasPoint as [number,number];
			context.lineTo(p1[0], lowestCanvasY);
			context.lineTo(p0[0], lowestCanvasY);
			context.lineTo(p0[0], p0[1]);
		};
		let i=0;
		for(const dataPoint of dataPoints) {
			const canvasPoint = canvasPoints[i];
			if(!prevDataPoint) {
				// first point
				firstCanvasPoint = canvasPoint;
				context.moveTo(canvasPoint[0], canvasPoint[1]);
			} else if(dataPoint[0] < prevDataPoint[0]) {
				// finish old chunk
				finishLastSection();
				// new chunk
				firstCanvasPoint = canvasPoint;
				context.moveTo(canvasPoint[0], canvasPoint[1]);
			} else {
				// draw a line to this new point
				context.lineTo(canvasPoint[0], canvasPoint[1]);
			}
			if(lowestCanvasY < canvasPoint[1]) {
				lowestCanvasY = canvasPoint[1];
			}
			prevDataPoint = dataPoint;
			prevCanvasPoint = canvasPoint;
			i++;
		}
		finishLastSection();
		context.fill();
		context.closePath();
	}
	
	drawDots(context: CanvasRenderingContext2D, canvasPoints: [number,number][], dotRadius: number) {
		if(canvasPoints.length == 0) {
			return;
		}
		for(const canvasPoint of canvasPoints) {
			context.beginPath();
			context.arc(canvasPoint[0] + 0.5, canvasPoint[1] - 0.5, dotRadius, 0, Math.PI*2, true);
			context.fill();
			context.closePath();
		}
	}

	drawPointLabels(context: CanvasRenderingContext2D, dataPoints: [number,number][], canvasPoints: [number,number][], labelProps: PointLabelProps) {
		const pointsCount = dataPoints.length;
		if(pointsCount == 0) {
			return;
		}
		let i=0;
		let lastLabelX: number | undefined = undefined;
		for(const dataPoint of dataPoints) {
			// ensure labels are spaced out by min interval
			if(labelProps.minLabelInterval && lastLabelX != null && dataPoint[0] < (lastLabelX + labelProps.minLabelInterval)) {
				i++;
				continue;
			}
			// draw label
			const canvasPoint = canvasPoints[i];
			let text;
			if(labelProps.getLabelText) {
				text = labelProps.getLabelText({
					index: i,
					x: dataPoint[0],
					y: dataPoint[1]
				});
			} else {
				text = `(${dataPoint[0]}, ${dataPoint[1]})`;
			}
			this.drawLabel(context, text, canvasPoint, labelProps);
			i++;
		}
	}



	drawAxisLinesGroup(context: CanvasRenderingContext2D, axisLineData: AxisLineData, layoutProps: LayoutProps) {
		const { points, axis, lineInsetMin, lineInsetMax, labelPosition, getLabelText } = axisLineData;
		if(!points || points.length == 0) {
			return;
		}
		if(!axis) {
			console.error("Missing 'axis' prop. Got "+axis);
			return;
		}
		const { dataRangeX, dataRangeY, rect } = layoutProps;
		const dataWidth = dataRangeX[1] - dataRangeX[0];
		const dataHeight = dataRangeY[1] - dataRangeY[0];
		const graphWidth = rect.right - rect.left;
		const graphHeight = rect.bottom - rect.top;
		// calculate canvas points
		const canvasPoints: number[] = [];
		let lineStart: number;
		let lineEnd: number;
		switch(axis) {
			case 'x': {
				lineStart = rect.bottom - (lineInsetMin ?? 0);
				lineEnd = rect.top + (lineInsetMax ?? 0);
				for(const lineDataX of points) {
					const lineCanvasX = this.calculateCanvasPointX(lineDataX, dataRangeX[0], dataWidth, rect.left, graphWidth);
					canvasPoints.push(lineCanvasX);
				}
			} break;

			case 'y': {
				lineStart = rect.left + (lineInsetMin ?? 0);
				lineEnd = rect.right - (lineInsetMax ?? 0);
				for(const lineDataY of points) {
					const lineCanvasY = this.calculateCanvasPointY(lineDataY, dataRangeY[0], dataHeight, rect.top, graphHeight);
					canvasPoints.push(lineCanvasY);
				}
			} break;

			default:
				console.error("Invalid 'axis' prop "+axis);
				return;
		}
		context.save();
		// draw lines
		context.lineWidth = axisLineData.lineWidth ?? 1;
		this.drawAxisLines(context, axis, canvasPoints, lineStart, lineEnd);
		// draw line labels if needed
		const showLabels = axisLineData.showLabels ?? (axisLineData.getLabelText != null);
		if(showLabels) {
			this.drawAxisLines(context, axis, canvasPoints, lineStart, lineEnd);
		}
		context.restore();
	}

	drawAxisLines(context: CanvasRenderingContext2D, axis: Axis, canvasPoints: number[], lineStart: number, lineEnd: number) {
		context.beginPath();
		switch(axis) {
			case 'x': {
				for(const lineX of canvasPoints) {
					context.moveTo(lineX, lineStart);
					context.lineTo(lineX, lineEnd);
				}
			} break;
			
			case 'y': {
				for(const lineY of canvasPoints) {
					context.moveTo(lineStart, lineY);
					context.lineTo(lineEnd, lineY);
				}
			} break;
			
			default:
				console.error("Invalid 'axis' prop "+axis);
				break;
		}
		context.stroke();
		context.closePath();
	}

	drawAxisLineLabels(context: CanvasRenderingContext2D, axis: Axis, points: number[], canvasPoints: number[], lineStart: number, lineEnd: number, lineStyle: AxisLineStyle) {
		const { labelPosition } = lineStyle;
		let canvasLabelPoint: number | undefined = undefined;
		switch(labelPosition ?? 'max') {
			case 'center':
				canvasLabelPoint = (lineStart + lineEnd) / 2.0;
				break;
			
			case 'min':
				canvasLabelPoint = lineStart;
				break;

			case 'max':
				canvasLabelPoint = lineEnd;
				break;
			
			default:
				console.error("Invalid 'labelPosition' prop "+labelPosition);
				break;
		}
		if(canvasLabelPoint == null) {
			return;
		}
		switch(axis) {
			case 'x': {
				let i = 0;
				for(const dataPointX of points) {
					const canvasPointX = canvasPoints[i];
					let text: string;
					if(lineStyle.getLabelText) {
						text = lineStyle.getLabelText({
							index: i,
							val: dataPointX
						});
					} else {
						text = `${dataPointX}`;
					}
					this.drawLabel(context, text, [canvasPointX,canvasLabelPoint], lineStyle);
					i++;
				}
			} break;

			case 'y': {
				let i = 0;
				for(const dataPointY of points) {
					const canvasPointY = canvasPoints[i];
					let text: string;
					if(lineStyle.getLabelText) {
						text = lineStyle.getLabelText({
							index: i,
							val: dataPointY
						});
					} else {
						text = `${dataPointY}`;
					}
					this.drawLabel(context, text, [canvasLabelPoint,canvasPointY], lineStyle);
					i++;
				}
			} break;

			default:
				console.error("Invalid 'axis' prop "+axis);
				break;
		}
	}



	render() {
		const props = this.props;
		const width = props.width ?? 268;
		const height = props.height ?? 200;
		return (
			<Canvas
				width={width}
				height={height}
				style={props.style}
				clearBeforeDraw={true}
				onDraw={(canvas, context, props) => {
					this.draw(context);
				}}/>
		);
	}
}
