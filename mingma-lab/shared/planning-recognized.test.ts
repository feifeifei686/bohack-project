import test from 'node:test'
import assert from 'node:assert/strict'
import { recognizedModel, renderRecognizedFloorplan, splitWall, inside } from './planning-recognized.ts'
import type { FloorplanResult } from './floorplan-contract.ts'
// Self-contained so the downloadable frontend source package can run its tests.
const sample: FloorplanResult = {
  "rooms": [
    {
      "id": "living",
      "name": "客厅",
      "kind": "living",
      "polygon": [
        [
          100,
          100
        ],
        [
          600,
          100
        ],
        [
          600,
          400
        ],
        [
          400,
          400
        ],
        [
          400,
          800
        ],
        [
          100,
          800
        ]
      ],
      "confidence": 0.9
    },
    {
      "id": "bedroom",
      "name": "卧室",
      "kind": "bedroom",
      "polygon": [
        [
          600,
          100
        ],
        [
          900,
          100
        ],
        [
          900,
          800
        ],
        [
          600,
          800
        ]
      ],
      "confidence": 0.85
    }
  ],
  "walls": [
    {
      "roomId": "living",
      "start": [
        100,
        100
      ],
      "end": [
        600,
        100
      ]
    },
    {
      "roomId": "bedroom",
      "start": [
        900,
        100
      ],
      "end": [
        900,
        800
      ]
    }
  ],
  "openings": [
    {
      "roomId": "living",
      "kind": "window",
      "start": [
        200,
        100
      ],
      "end": [
        400,
        100
      ]
    }
  ],
  "furniture": [
    {
      "id": "bed1",
      "roomId": "bedroom",
      "kind": "bed",
      "bounds": [
        650,
        300,
        200,
        300
      ],
      "rotation": 90,
      "confidence": 0.9
    }
  ],
  "warnings": [
    "合成测试图形，不代表模型识别准确率。"
  ]
}
test('image-to-world mapping retains source aspect and concave room, with dynamic furniture',()=>{
  const m=recognizedModel(sample,'data:image/png;base64,abc',.7)
  const b=m.imageBounds!
  assert.ok(Math.abs(b[2]/b[3]-.7)<.000001)
  assert.equal(m.rooms[0].polygon!.length,6)
  assert.equal(m.furniture!.length,1)
  assert.ok(inside(m.rooms[0].label,m.rooms[0].polygon!))
  const scene=renderRecognizedFloorplan(m,false)
  assert.match(scene,/data-model-prism/);assert.match(scene,/data-plan-furniture="bed1"/)
  assert.doesNotMatch(scene,/bath-vanity/)
  m.rooms[0].name='<img src=x onerror=alert(1)>'
  assert.doesNotMatch(renderRecognizedFloorplan(m,false),/<img/)
})
test('doors and windows split wall segments without filling the opening',()=>{
  const w={roomId:'r',start:[0,0] as [number,number],end:[10,0] as [number,number]}
  const result=splitWall(w,[{...w,start:[3,0],end:[5,0]}])
  assert.deepEqual(result.map(x=>[x.start,x.end]),[[[0,0],[3,0]],[[5,0],[10,0]]])
  assert.deepEqual(splitWall(w,[{...w,start:[3,2],end:[5,2]}]),[w])
})
