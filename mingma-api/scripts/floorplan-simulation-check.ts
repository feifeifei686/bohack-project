/** Run the existing Postman simulation on 5210 first. Never loads real credentials. */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app.ts'
import { readConfig } from '../src/config.ts'

const base=process.env.FLOORPLAN_SIMULATION_URL || 'http://127.0.0.1:5210/deepseek'
const config=readConfig({DEEPSEEK_API_KEY:'simulation-only',ALLOW_MOCK_PROVIDER:'true',DEEPSEEK_BASE_URL:base,AI_TIMEOUT_MS:'200'})
const app=createApp(config)
await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve))
const url=`http://127.0.0.1:${(app.address() as AddressInfo).port}/api/ai/floorplan`
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRXsAAAAASUVORK5CYII='
const setScenario=async(scenario:string)=>{const r=await fetch(`${base}/__scenario`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario})});assert.equal(r.status,200)}
try {
  for(const [scenario,status,code] of [
    ['success',200,''],['401',502,'AI_UPSTREAM_AUTH'],['429',429,'AI_UPSTREAM_RATE_LIMIT'],
    ['500',503,'AI_UPSTREAM_UNAVAILABLE'],['bad-json',502,'AI_INVALID_OUTPUT'],['bad-schema',502,'AI_INVALID_OUTPUT'],
    ['truncated',502,'AI_OUTPUT_TRUNCATED'],['timeout',504,'AI_TIMEOUT'],
  ] as const) {
    await setScenario(scenario)
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})})
    const body=await response.json()
    assert.equal(response.status,status,JSON.stringify(body))
    if(code) assert.equal(body.error.code,code)
    else {assert.equal(body.data.rooms.length,2);assert.equal(body.data.furniture.length,1);assert.equal(body.meta.requiresHumanConfirmation,true)}
    assert.ok(!JSON.stringify(body).includes('UPSTREAM_PRIVATE_DETAIL'))
    console.log(`PASS ${scenario}: ${status}`)
  }
} finally {await setScenario('success');app.closeAllConnections();await new Promise<void>(resolve=>app.close(()=>resolve()))}
