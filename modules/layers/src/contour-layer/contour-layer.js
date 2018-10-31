// Copyright (c) 2015 - 2018 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import {
  CompositeLayer,
  _GPUGridAggregator as GPUGridAggregator,
  _pointToDensityGridData as pointToDensityGridData
} from '@deck.gl/core';
import {LineLayer} from '@deck.gl/layers';
import {_SolidPolygonLayer as SolidPolygonLayer} from '@deck.gl/layers';

import {generateContours} from './contour-utils';

const DEFAULT_COLOR = [255, 255, 255];
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_THRESHOLD = 1;

const defaultProps = {
  // grid aggregation
  cellSize: {type: 'number', min: 1, max: 1000, value: 1000},
  getPosition: {type: 'accessor', value: x => x.position},

  // contour lines
  contours: [{threshold: DEFAULT_THRESHOLD}],

  fp64: false
};

export default class ContourLayer extends CompositeLayer {
  initializeState() {
    const {gl} = this.context;
    const options = {
      id: `${this.id}-gpu-aggregator`,
      shaderCache: this.context.shaderCache
    };
    this.state = {
      contourData: {},
      gridAggregator: new GPUGridAggregator(gl, options)
    };
  }

  updateState({oldProps, props, changeFlags}) {
    let contoursDirty = false;
    if (changeFlags.dataChanged || oldProps.cellSize !== props.cellSize) {
      contoursDirty = true;
      // Clear countsData cache
      this.setState({countsData: null});
      this.aggregateData();
    }

    contoursDirty = contoursDirty || this.rebuildContours({oldProps, props});
    if (contoursDirty) {
      this.generateContours();
    }
  }

  getSubLayerClass() {
    return LineLayer;
  }

  getLineLayerProps() {
    const {fp64} = this.props;

    return super.getSubLayerProps({
      id: 'contour-line-layer',
      data: this.state.contourData.contourSegments,
      fp64,
      getSourcePosition: d => d.start,
      getTargetPosition: d => d.end,
      getColor: this.onGetSublayerColor.bind(this),
      getStrokeWidth: this.onGetSublayerStrokeWidth.bind(this)
    });
  }

  getSolidPolygonLayerProps() {
    const {fp64} = this.props;

    return super.getSubLayerProps({
      id: 'contour-solid-polygon-layer',
      data: this.state.contourData.contourTriangles,
      fp64,
      getPolygon: d => d.vertices
    });
  }

  renderLayers() {
    // const SubLayerClass = this.getSubLayerClass();
    const {contourSegments, contourTriangles} = this.state.contourData;
    const hasIsoLines = contourSegments && contourSegments.length > 0;
    const hasIsoBands = contourTriangles && contourTriangles.length > 0;

    const lineLayer = hasIsoLines && new LineLayer(this.getLineLayerProps());
    const solidPolygonLayer = hasIsoBands && new SolidPolygonLayer(this.getSolidPolygonLayerProps());
    return [lineLayer, solidPolygonLayer];
  }

  // Private

  aggregateData() {
    const {
      data,
      cellSize: cellSizeMeters,
      getPosition,
      gpuAggregation,
      fp64,
      coordinateSystem
    } = this.props;
    const {countsData, countsBuffer, gridSize, gridOrigin, cellSize} = pointToDensityGridData({
      data,
      cellSizeMeters,
      getPosition,
      gpuAggregation,
      gpuGridAggregator: this.state.gridAggregator,
      fp64,
      coordinateSystem,
      viewport: this.context.viewport
    });

    this.setState({countsData, countsBuffer, gridSize, gridOrigin, cellSize});
  }

  generateContours() {
    const {gridSize, gridOrigin, cellSize} = this.state;
    let {countsData} = this.state;
    if (!countsData) {
      const {countsBuffer} = this.state;
      countsData = countsBuffer.getData();
      this.setState({countsData});
    }

    const {cellWeights} = GPUGridAggregator.getCellData({countsData});
    const thresholds = this.props.contours.map(x => x.threshold);
    const contourData = generateContours({
      thresholds,
      cellWeights,
      gridSize,
      gridOrigin,
      cellSize
    });

    // contourData contains both iso-lines and iso-bands if requested.
    this.setState({contourData});
  }

  onGetSublayerColor(segment) {
    const {contours} = this.props;
    let color = DEFAULT_COLOR;
    contours.forEach(data => {
      if (data.threshold === segment.threshold) {
        color = data.color || DEFAULT_COLOR;
      }
    });
    return color;
  }

  onGetSublayerStrokeWidth(segment) {
    const {contours} = this.props;
    let strokeWidth = DEFAULT_STROKE_WIDTH;
    // Linearly searches the contours, but there should only be few contours
    contours.some(contour => {
      if (contour.threshold === segment.threshold) {
        strokeWidth = contour.strokeWidth || DEFAULT_STROKE_WIDTH;
        return true;
      }
      return false;
    });
    return strokeWidth;
  }

  rebuildContours({oldProps, props}) {
    if (oldProps.contours.length !== props.contours.length) {
      return true;
    }
    const oldThresholds = oldProps.contours.map(x => x.threshold);
    const thresholds = props.contours.map(x => x.threshold);

    return thresholds.some((_, i) => thresholds[i] !== oldThresholds[i]);
  }
}

ContourLayer.layerName = 'ContourLayer';
ContourLayer.defaultProps = defaultProps;
