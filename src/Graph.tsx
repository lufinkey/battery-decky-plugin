
import { Component } from 'react';
import { Canvas } from './Canvas';

type Rect = {
	left: number
	top: number
	right: number
	bottom: number
};

type Props = {
	data: [number,number][]
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
	gridStrokeStyle?: string
	lineStrokeStyle?: string
	fillStyle?: string
	backgroundFillStyle?: string

	showDots?: boolean
	dotsFillStyle?: string
	dotRadius?: number
};

type State = {
	//
};

// credit to https://github.com/MatthewCallis/Canvas-Graphs (used as reference while writing this)

export class Graph extends Component<Props,State> {
	constructor(props: Props) {
		super(props);
	}

	calculateVisibleRange(data: [number,number][],
		xMin: number | undefined, xMax: number | undefined,
		yMin: number | undefined, yMax: number | undefined,
		xMinPadding: number,
		xMaxPadding: number,
		yMinPadding: number,
		yMaxPadding: number): {x:[number,number],y:[number,number]} {
		if(xMin != null && xMax != null && yMin != null && yMax != null) {
			return { x: [xMin, xMax], y: [yMin, yMax] };
		}
		if(data.length == 0) {
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
		} else if(data.length == 1) {
			const p = data[0];
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
			const dataLen = data.length;
			let point = data[0];
			let px = point[0];
			let py = point[1];
			let trueRangeXMin = px;
			let trueRangeXMax = px;
			let trueRangeYMin = py;
			let trueRangeYMax = py;
			for(let i=1; i<dataLen; i++) {
				point = data[i];
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
		const {
			data, width, height,
			gridSpacingX, gridSpacingY,
			dataPaddingX, dataPaddingY,
			paddingLeft, paddingRight,
			xMin, xMax, yMin, yMax,
			backgroundFillStyle, gridStrokeStyle, lineStrokeStyle, fillStyle,
			showDots, dotsFillStyle, dotRadius } = this.props;

		// calculate graph rect
		const graphCanvasRect: Rect = {left: (paddingLeft ?? 0), top: 0, right: (width - (paddingRight ?? 0)), bottom: height}

		// calculate visual data range
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
		const { x: rangeX, y: rangeY } = this.calculateVisibleRange(data, xMin, xMax, yMin, yMax, xMinPadding, xMaxPadding, yMinPadding, yMaxPadding);
		
		// clear canvas
		context.clearRect(0, 0, width, height);

		// draw background
		if(backgroundFillStyle) {
			context.fillStyle = backgroundFillStyle;
			context.fillRect(0,0,width,height);
		}
		
		// draw grid
		if(gridSpacingX || gridSpacingY) {
			context.strokeStyle = gridStrokeStyle ?? 'lightgray';
			this.drawGrid(context, graphCanvasRect, gridSpacingX, gridSpacingY, rangeX, rangeY);
		}
		
		// draw line, fill, and dots
		if(data && data.length > 0) {
			context.strokeStyle = lineStrokeStyle ?? 'black';
			this.drawLine(context, graphCanvasRect, data, rangeX, rangeY);
			context.fillStyle = fillStyle ?? 'rgba(140,140,140,0.5)';
			this.drawFill(context, graphCanvasRect, data, rangeX, rangeY);
			if(showDots ?? true) {
				context.fillStyle = dotsFillStyle ?? 'black';
				this.drawDots(context, graphCanvasRect, data, rangeX, rangeY, dotRadius ?? 3);
			}
		}
	}

	drawGrid(context: CanvasRenderingContext2D, rect: Rect,
		gridSpacingX: number | null | undefined, gridSpacingY: number | null | undefined,
		dataRangeX: [number,number],
		dataRangeY: [number,number]) {
		if(!gridSpacingX && !gridSpacingY) {
			return;
		}
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

	drawLine(context: CanvasRenderingContext2D, rect: Rect, data: [number,number][], dataRangeX: [number,number], dataRangeY: [number,number]) {
		if(data.length == 0) {
			return;
		}
		context.beginPath();
		const lineWidthOffset = ((context.lineWidth + 1) % 2) / 2;
		let prevPoint: [number,number] | undefined = undefined;
		for(let i=0; i<data.length; i++) {
			const point = data[i];
			const [canvasPointX, canvasPointY] = this.calculateCanvasPoint(point, dataRangeX, dataRangeY, rect);
			if(!prevPoint || point[0] < prevPoint[0]) {
				// since we have no previous point, or this point is before the previous point, start a new line
				context.moveTo(canvasPointX + lineWidthOffset, canvasPointY);
			} else {
				// draw a line to this new point
				context.lineTo(canvasPointX + lineWidthOffset, canvasPointY);
			}
			prevPoint = point;
		}
		context.stroke();
		context.closePath();
	}

	drawFill(context: CanvasRenderingContext2D, rect: Rect, data: [number,number][], dataRangeX: [number,number], dataRangeY: [number,number]) {
		if(data.length == 0) {
			return;
		}
		context.beginPath();
		let firstCanvasPoint: [number,number] | undefined = undefined;
		let prevCanvasPoint: [number,number] | undefined = undefined;
		let lowestCanvasY: number = rect.bottom;
		const finishLastSection = () => {
			const p0 = firstCanvasPoint as [number,number];
			const p1 = prevCanvasPoint as [number,number];
			context.lineTo(p1[0], lowestCanvasY);
			context.lineTo(p0[0], lowestCanvasY);
			context.lineTo(p0[0], p0[1]);
		};
		for(let i=0; i<data.length; i++){
			const point = data[i];
			const [canvasPointX, canvasPointY] = this.calculateCanvasPoint(point, dataRangeX, dataRangeY, rect);
			if(!prevCanvasPoint) {
				// first point
				firstCanvasPoint = [canvasPointX,canvasPointY];
				context.moveTo(canvasPointX, canvasPointY);
			} else if(canvasPointX < prevCanvasPoint[0]) {
				// finish old chunk
				finishLastSection();
				// new chunk
				firstCanvasPoint = [canvasPointX,canvasPointY];
				context.moveTo(canvasPointX, canvasPointY);
			} else {
				// draw a line to this new point
				context.lineTo(canvasPointX, canvasPointY);
			}
			if(lowestCanvasY < canvasPointY) {
				lowestCanvasY = canvasPointY;
			}
			prevCanvasPoint = [canvasPointX,canvasPointY];
		}
		finishLastSection()
		context.fill();
		context.closePath();
	}

	drawDots(context: CanvasRenderingContext2D, rect: Rect, data: [number,number][], dataRangeX: [number,number], dataRangeY: [number,number], dotRadius: number) {
		for(var i=0; i<data.length; i++){
			const point = data[i];
			const [canvasPointX, canvasPointY] = this.calculateCanvasPoint(point, dataRangeX, dataRangeY, rect);
			context.beginPath();
			context.arc(canvasPointX + 0.5, canvasPointY - 0.5, dotRadius, 0, Math.PI*2, true);
			context.fill();
			context.closePath();
		}
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
