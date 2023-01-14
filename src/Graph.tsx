
import { Component } from 'react';
import { Canvas } from './Canvas';

type Rect = {
	left: number
	top: number
	right: number
	bottom: number
};

type LabelFillStyle = 'string' | CanvasGradient | CanvasPattern;

type LabelProps = {
	labelFont?: string
	labelTextBaseline?: CanvasTextBaseline
	labelTextAlign?: CanvasTextAlign
	labelFillStyle?: LabelFillStyle
	minLabelInterval?: number
	getLabelText?: (x: number, y: number) => string
};

type LineData = {
	points: [number,number][]
	displayName?: string
	strokeStyle?: string
	fillStyle?: string

	showDots?: boolean
	dotsFillStyle?: string
	dotRadius?: number

	showLabels?: boolean
} & LabelProps;



type Props = {
	lines: LineData[]

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

	showLabels?: boolean
} & LabelProps;

type State = {
	//
};


type LayoutProps = {
	dataRangeX: [number,number]
	dataRangeY: [number,number]
	rect: Rect
};




// credit to https://github.com/MatthewCallis/Canvas-Graphs (used as reference while writing this)

export class Graph extends Component<Props,State> {
	constructor(props: Props) {
		super(props);
	}

	calculateLayoutProps(props: Props): LayoutProps {
		const { lines, width, height, xMin, xMax, yMin, yMax,
			dataPaddingX, dataPaddingY,
			paddingLeft, paddingRight, paddingTop, paddingBottom } = props;
		// calculate graph rect
		const rect: Rect = {
			left: (paddingLeft ?? 0),
			top: (paddingTop ?? 0),
			right: (width - (paddingRight ?? 0)),
			bottom: (height - (paddingBottom ?? 0))
		};
		
		// calculate visible range
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
		const { x: dataRangeX, y: dataRangeY } = this.calculateVisibleRange(lines, xMin, xMax, yMin, yMax, xMinPadding, xMaxPadding, yMinPadding, yMaxPadding);
		return {
			dataRangeX,
			dataRangeY,
			rect
		};
	}

	calculateVisibleRange(lines: LineData[],
		xMin: number | undefined, xMax: number | undefined,
		yMin: number | undefined, yMax: number | undefined,
		xMinPadding: number,
		xMaxPadding: number,
		yMinPadding: number,
		yMaxPadding: number): {x:[number,number],y:[number,number]} {
		if(xMin != null && xMax != null && yMin != null && yMax != null) {
			return { x: [xMin, xMax], y: [yMin, yMax] };
		}
		let c = 0;
		let firstPoint: [number,number] | undefined = undefined;
		for(const lineData of lines) {
			const pointsLen = lineData.points.length;
			if(pointsLen > 0) {
				if(c == 0) {
					firstPoint = lineData.points[0];
				}
				c += lineData.points.length;
				if(c > 1) {
					break;
				}
			}
		}
		if(c == 0) {
			if(xMin == null) {
				if(xMax != null) {
					xMin = xMax - xMinPadding;
				} else {
					xMin = 0;
				}
			}
			if(xMax == null) {
				xMax = xMin + xMaxPadding;
			}
			if(yMin == null) {
				if(yMax != null) {
					yMin = yMax - yMinPadding;
				} else {
					yMin = 0;
				}
			}
			if(yMax == null) {
				yMax = yMin + yMaxPadding;
			}
		} else if(c == 1) {
			const p = firstPoint as [number,number];
			if(xMin == null) {
				if(xMax != null && xMax < p[0]) {
					xMin = xMax - xMinPadding;
				} else {
					xMin = p[0] - xMinPadding;
				}
			}
			if(xMax == null) {
				if(xMin != null && xMin > p[0]) {
					xMax = xMin + xMaxPadding;
				} else {
					xMax = p[0] + xMaxPadding;
				}
			}
			if(yMin == null) {
				if(yMax != null && yMax < p[1]) {
					yMin = yMax - yMinPadding;
				} else {
					yMin = p[1] - yMinPadding;
				}
			}
			if(yMax == null) {
				if(yMin != null && yMin > p[1]) {
					yMax = yMin + yMaxPadding;
				} else {
					yMax = p[1] + yMaxPadding;
				}
			}
		} else {
			firstPoint = firstPoint as [number,number];
			let px = firstPoint[0];
			let py = firstPoint[1];
			let trueRangeXMin = px;
			let trueRangeXMax = px;
			let trueRangeYMin = py;
			let trueRangeYMax = py;
			for(const lineData of lines) {
				for(const point of lineData.points) {
					px = point[0];
					py = point[1];
					if(px < trueRangeXMin) {
						trueRangeXMin = px;
					} else if(px > trueRangeXMax) {
						trueRangeXMax = px;
					}
					if(py < trueRangeYMin) {
						trueRangeYMin = py;
					} else if(py > trueRangeYMax) {
						trueRangeYMax = py;
					}
				}
			}
			if(xMin == null) {
				if(xMax != null && xMax < trueRangeXMin) {
					xMin = xMax - xMinPadding;
				} else {
					xMin = trueRangeXMin - xMinPadding;
				}
			}
			if(xMax == null) {
				if(xMin != null && xMin > trueRangeXMax) {
					xMax = xMin + xMaxPadding;
				} else {
					xMax = trueRangeXMax + xMaxPadding;
				}
			}
			if(yMin == null) {
				if(yMax != null && yMax < trueRangeYMin) {
					yMin = yMax - yMinPadding;
				} else {
					yMin = trueRangeYMin - yMinPadding;
				}
			}
			if(yMax == null) {
				if(yMin != null && yMin > trueRangeYMax) {
					yMax = yMin + yMaxPadding;
				} else {
					yMax = trueRangeYMax + yMaxPadding;
				}
			}
		}
		return { x: [xMin,xMax], y: [yMin,yMax] };
	}

	calculateCanvasPoint(point: [number,number], dataRangeX: [number,number], dataRangeY: [number, number], rect: Rect): [number,number] {
		const dataWidth = dataRangeX[1] - dataRangeX[0];
		const dataHeight = dataRangeY[1] - dataRangeY[0];
		const graphWidth = rect.right - rect.left;
		const graphHeight = rect.bottom - rect.top;
		return [
			rect.left + (((point[0] - dataRangeX[0]) / dataWidth) * graphWidth),
			rect.top + (graphHeight - ((point[1] - dataRangeY[0]) / dataHeight) * graphHeight)
		];
	}



	draw(context: CanvasRenderingContext2D) {
		// get props
		const props = this.props;
		const {
			lines, width, height,
			gridSpacingX, gridSpacingY,
			backgroundFillStyle, gridStrokeStyle,
			 } = this.props;
		const layoutProps = this.calculateLayoutProps(props);
		const { dataRangeX, dataRangeY, rect } = layoutProps;
		const dataWidth = dataRangeX[1] - dataRangeX[0];
		const dataHeight = dataRangeY[1] - dataRangeY[0];
		const graphWidth = rect.right - rect.left;
		const graphHeight = rect.bottom - rect.top;
		
		// clear canvas
		context.clearRect(0, 0, width, height);

		// draw background
		if(backgroundFillStyle) {
			context.fillStyle = backgroundFillStyle;
			context.fillRect(
				rect.left,
				rect.top,
				rect.right-layoutProps.rect.left,
				rect.bottom-layoutProps.rect.top);
		}
		
		// draw grid
		if(gridSpacingX || gridSpacingY) {
			context.strokeStyle = gridStrokeStyle ?? 'lightgray';
			this.drawGrid(context, layoutProps, gridSpacingX, gridSpacingY);
		}
		
		// draw line, fill, and dots
		const sharedLabelProps: LabelProps = {
			labelFont: props.labelFont,
			labelTextBaseline: props.labelTextBaseline,
			labelTextAlign: props.labelTextAlign,
			labelFillStyle: props.labelFillStyle,
			minLabelInterval: props.minLabelInterval,
			getLabelText: props.getLabelText
		};
		for(const lineData of lines) {
			const points = lineData.points;
			if(points && points.length > 0) {
				const canvasPoints: [number,number][] = [];
				for(const point of points) {
					const canvasPoint: [number,number] = [
						rect.left + (((point[0] - dataRangeX[0]) / dataWidth) * graphWidth),
						rect.top + (graphHeight - ((point[1] - dataRangeY[0]) / dataHeight) * graphHeight)
					];
					canvasPoints.push(canvasPoint);
				}
				context.strokeStyle = lineData.strokeStyle ?? 'black';
				this.drawLine(context, points, canvasPoints);
				context.fillStyle = lineData.fillStyle ?? 'rgba(140,140,140,0.5)';
				this.drawFill(context, rect, points, canvasPoints);
				if(lineData.showDots ?? true) {
					context.fillStyle = lineData.dotsFillStyle ?? 'black';
					this.drawDots(context, canvasPoints, lineData.dotRadius ?? 3);
				}
				const showLabels = lineData.showLabels ?? props.showLabels ?? (lineData.getLabelText != null || props.getLabelText != null);
				if(showLabels) {
					const labelProps = {...sharedLabelProps}
					for(const propName in sharedLabelProps) {
						const overrideProp = lineData[propName];
						if(overrideProp != null) {
							labelProps[propName] = overrideProp;
						}
					}
					this.drawLabels(context, points, canvasPoints, labelProps);
				}
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

	drawLine(context: CanvasRenderingContext2D, points: [number,number][], canvasPoints: [number,number][]) {
		console.assert(points.length == canvasPoints.length);
		const pointsCount = points.length;
		if(pointsCount == 0) {
			return;
		}
		context.beginPath();
		const lineWidthOffset = ((context.lineWidth + 1) % 2) / 2;
		let prevPoint: [number,number] | undefined = undefined;
		let i=0;
		for(const point of points) {
			const canvasPoint = canvasPoints[i];
			if(!prevPoint || point[0] < prevPoint[0]) {
				// since we have no previous point, or this point is before the previous point, start a new line
				context.moveTo(canvasPoint[0] + lineWidthOffset, canvasPoint[1]);
			} else {
				// draw a line to this new point
				context.lineTo(canvasPoint[0] + lineWidthOffset, canvasPoint[1]);
			}
			prevPoint = point;
			i++;
		}
		context.stroke();
		context.closePath();
	}

	drawFill(context: CanvasRenderingContext2D, rect: Rect, points: [number,number][], canvasPoints: [number,number][]) {
		const pointsCount = points.length;
		if(pointsCount == 0) {
			return;
		}
		context.beginPath();
		let firstCanvasPoint: [number,number] | undefined = undefined;
		let prevCanvasPoint: [number,number] | undefined = undefined;
		let prevPoint: [number,number] | undefined = undefined;
		let lowestCanvasY: number = rect.bottom;
		const finishLastSection = () => {
			const p0 = firstCanvasPoint as [number,number];
			const p1 = prevCanvasPoint as [number,number];
			context.lineTo(p1[0], lowestCanvasY);
			context.lineTo(p0[0], lowestCanvasY);
			context.lineTo(p0[0], p0[1]);
		};
		let i=0;
		for(const point of points) {
			const canvasPoint = canvasPoints[i];
			if(!prevPoint) {
				// first point
				firstCanvasPoint = canvasPoint;
				context.moveTo(canvasPoint[0], canvasPoint[1]);
			} else if(point[0] < prevPoint[0]) {
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
			prevPoint = point;
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

	drawLabels(context: CanvasRenderingContext2D, points: [number,number][], canvasPoints: [number,number][], labelProps: LabelProps) {
		const pointsCount = points.length;
		if(pointsCount == 0) {
			return;
		}
		let i=0;
		for(const point of points){
			const canvasPoint = canvasPoints[i];
			this.drawLabel(context, point, canvasPoint, labelProps);
			i++;
		}
	}

	drawLabel(context: CanvasRenderingContext2D, point: [number,number], canvasPoint: [number,number], labelProps: LabelProps) {
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
		let text;
		if(labelProps.getLabelText) {
			text = labelProps.getLabelText(point[0], point[1]);
		} else {
			text = `(${point[0]}, ${point[1]})`;
		}
		const labelX = canvasPoint[0];
		const labelY = canvasPoint[1];
		context.fillText(text, labelX, labelY);
		context.restore();
	}



	render() {
		const props = this.props;
		return (
			<Canvas
				width={props.width ?? 100}
				height={props.height ?? 100}
				onDraw={(canvas, context, props) => {
					this.draw(context);
				}}/>
		);
	}
}
