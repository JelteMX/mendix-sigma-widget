import {
    defineWidget,
    log,
    runCallback,
    executePromise,
    fetchAttr,
    commitData,
} from 'widget-base-helpers';

import all from 'dojo/promise/all';
import lang from 'dojo/_base/lang';
import { forEach } from 'dojo/_base/array';

import sigma from 'sigma';
window.sigma = window.sigma || sigma;

require('sigma/build/plugins/sigma.layout.forceAtlas2.min');
require('sigma/build/plugins/sigma.plugins.dragNodes.min');

import template from './Sigma.template.html';

/* develblock:start */
import loadcss from 'loadcss';
loadcss(`/widgets/Sigma/widget/ui/Sigma.css`);
/* develblock:end */
import './Sigma.scss';

const roundFloat = num => Math.round(num * 100000000) / 100000000;

export default defineWidget('Sigma', template, {

    nodeEntity: '',
    edgeEntity: '',
    nodeMicroflow: '',
    edgeMicroflow: '',
    nodeLabelAttr: '',
    nodeXAttr: '',
    nodeYAttr: '',
    nodeSizeAttr: '',
    nodeColorAttr: '',
    edgeSourceNodeEntity: '',
    edgeTargetNodeEntity: '',
    edgeSizeAttr: '',
    edgeColorAttr: '',
    sigmaOptionsStr: '',
    draggableNodes: false,

    sigmaNode: null,

    _obj: null,
    _sigma: null,
    _dragListener: null,

    _nodeObjects: [],
    _edgeObjects: [],
    _nodes: [],
    _edges: [],
    _extraOptions: {},
    _setup: false,

    constructor() {
        this.log = log.bind(this);
        this.runCallback = runCallback.bind(this);
        this.executePromise = executePromise.bind(this);
    },

    _cleanupSigma() {
        if (this._sigma) {
            this._sigma.graph && this._sigma.graph.clear();
            this._sigma.graph && this._sigma.graph.kill();
            this._sigma.kill && this._sigma.kill();
        }

        this._nodeObjects = [];
        this._edgeObjects = [];

        this._nodes = [];
        this._edges = [];
    },

    postCreate() {
        this.log('postCreate', this._WIDGET_VERSION);

        this.addOnDestroy(() => {
            this.log('destroy');
            this._cleanupSigma();
        });

        try {
            this._extraOptions = JSON.parse(this.sigmaOptionsStr);
        } catch (error) {
            console.warn(this.id + ' error reading options', error);
            this._extraOptions = {};
        }

        const settings = lang.mixin({
            sideMargin: 3,
            dragTimeout: 500,
        }, this._extraOptions);

        if (this._sigma) {
            this._sigma.kill();
        }
        this._sigma = new sigma({
            renderer: {
                container: this.sigmaNode,
                type: 'canvas',
            },
            settings,
        });
        window._sigma = this._sigma;

        if (this.draggableNodes) {
            const dragListener = sigma.plugins.dragNodes(this._sigma, this._sigma.renderers[ 0 ]);

            dragListener.bind('startdrag', () => {
                //
            });

            dragListener.bind('dragend', () => {
                this._nodes = this._sigma.graph.nodes();
                this._edges = this._sigma.graph.edges();
                this._syncDataNodesEdges();
            });
        }

        // // Bind the events:
        // this._sigma.bind('clickNode doubleClickNode', e => {
        //     console.log(e.type, e.data.node.obj, e.data.node.label, e.data.captor);
        // });
        // this._sigma.bind('clickEdge doubleClickEdge', e => {
        //     console.log(e.type, e.data.node.obj, e.data.edge, e.data.captor);
        // });
        // this._sigma.bind('clickStage', e => {
        //     console.log(e.type, e.data.captor);
        // });
        // this._sigma.bind('doubleClickStage rightClickStage', e => {
        //     console.log(e.type, e.data);
        // });

        this._nodeObjects = [];
        this._edgeObjects = [];

        this._nodes = [];
        this._edges = [];
    },

    update(obj, cb) {
        this.log('update');

        this._obj = obj;

        if (this._obj) {
            this.getData(cb);
            // this._resetSubscriptions();
        } else {
            this._sigma.graph && this._sigma.graph.clear();
            this._sigma.refresh();

            this.runCallback(cb, 'update');
        }
    },

    // _resetSubscriptions() {
    //     this.log('_resetSubscriptions');

    //     this.unsubscribeAll();

    //     this.subscribe({
    //         guid: this._obj.getGuid(),
    //         callback: guid => {
    //             console.log(1, guid);
    //         },
    //         error: err => {
    //             console.log(err);
    //         },
    //     });
    // },

    async _syncDataNodesEdges() {
        this.log('_syncDataNodesEdges');
        const objs = [];
        forEach(this._nodes, node => {
            node.obj.set(this.nodeXAttr, roundFloat(node.x));
            node.obj.set(this.nodeYAttr, roundFloat(node.y));
            objs.push(node.obj);
        });

        try {
            await commitData({ mxobjs: objs });
        } catch (error) {
            console.warn(this.id + '._syncDataNodesEdges save error:', error);
        }
    },

    _getReferencePath(attr) {
        const parts = attr.split('/');
        return parts[ 0 ]; // Check if this is valid! Because a path can be longer
    },

    async getData(cb) {
        this.log('getData');
        const guid = this._obj.getGuid();

        try {
            this._nodeObjects = await this.executePromise(this.nodeMicroflow, guid);
            this._edgeObjects = await this.executePromise(this.edgeMicroflow, guid);

            this._nodes = await this._transFormNodes(this._nodeObjects);
            this._edges = await this._transFormEdges(this._edgeObjects);

            const data = {
                nodes: this._nodes,
                edges: this._edges,
            };

            this._sigma.graph.clear();

            this._sigma.graph.read(data);
            this._sigma.refresh();

            this.runCallback(cb, 'getData');
        } catch (error) {
            console.warn(this.id + ': error in getData:', error);

            this._cleanupSigma();

            this.runCallback(cb, 'getData');
        }
    },

    async _transFormNodes(nodeObjects) {
        return all(nodeObjects.map(async obj => {
            const label = await fetchAttr(obj, this.nodeLabelAttr);
            const x = await fetchAttr(obj, this.nodeXAttr);
            const y = await fetchAttr(obj, this.nodeYAttr);

            const nodeObj = {
                id: `${obj.getGuid()}`,
                label,
                x: parseFloat(x),
                y: parseFloat(y),
                obj,
            };

            if (this.nodeSizeAttr) {
                const s = await fetchAttr(obj, this.nodeSizeAttr);
                nodeObj.size = parseInt(s, 10);
            } else {
                nodeObj.size = 1;
            }

            if (this.nodeColorAttr) {
                nodeObj.color = await fetchAttr(obj, this.nodeColorAttr);
            }

            return nodeObj;
        }));
    },

    _transFormEdges(edgeObjects) {
        return all(edgeObjects.map(async obj => {
            const source = await fetchAttr(obj, this._getReferencePath(this.edgeSourceNodeEntity));
            const target = await fetchAttr(obj, this._getReferencePath(this.edgeTargetNodeEntity));

            const edgeObj = {
                id: `${obj.getGuid()}`,
                source,
                target,
                obj,
            };

            if (this.edgeSizeAttr) {
                const s = await fetchAttr(obj, this.edgeSizeAttr);
                edgeObj.size = parseInt(s, 10);
            }

            if (this.edgeColorAttr) {
                edgeObj.color = await fetchAttr(obj, this.edgeColorAttr);
            }

            return edgeObj;
        }));
    },
});
