
import { Component, createRef, RefObject, HTMLAttributes } from 'react';

type BaseCanvasProps = HTMLAttributes<HTMLCanvasElement> & {
	width: number;
	height: number;
};

type AdditionalCanvasProps = {
	clearBeforeDraw?: boolean;
	onDraw?: (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, props: Props) => void;
};
const AdditionalCanvasPropKeys: (keyof AdditionalCanvasProps)[] = ['clearBeforeDraw','onDraw'];

type Props = BaseCanvasProps & AdditionalCanvasProps;

type State = {};

export class Canvas extends Component<Props,State> {
	canvasRef: RefObject<HTMLCanvasElement>

	constructor(props: Props) {
		super(props)

		this.canvasRef = createRef<HTMLCanvasElement>();
	}

	componentDidMount(): void {
		this.redraw();
	}

	componentDidUpdate(prevProps: Readonly<Props>, prevState: Readonly<State>, snapshot?: any): void {
		this.redraw();
	}

	redraw(forceClear: boolean = false) {
		const props = this.props;
		const { onDraw } = props;
		if(onDraw) {
			// get canvas ref
			const canvas = this.canvasRef.current;
			if(canvas == null) {
				console.error("No canvas reference");
				return;
			}
			// get rendering context
			const context = canvas.getContext("2d");
			if(context == null) {
				console.error("No 2D rendering context");
				return;
			}
			// clear canvas if needed
			if(props.clearBeforeDraw ?? true) {
				context.clearRect(0, 0, props.width, props.height);
			}
			// draw
			onDraw(canvas, context, props);
		}
	}
	
	render() {
		console.log("Canvas.render");
		const canvasProps = {...this.props};
		for(const key in AdditionalCanvasPropKeys) {
			delete canvasProps[key];
		}
		return <canvas {...canvasProps} ref={this.canvasRef}/>
	}
}
