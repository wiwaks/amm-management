import { useEffect, useRef } from 'react'

/**
 * Animated WebGL mesh gradient inspired by Stripe.
 * Simplex noise + blend modes on a deformed plane geometry.
 * Credits: Stripe.com, Kevin Hufnagl, Ashima Arts (GLSL noise, MIT).
 */

// ────────────────── helpers ──────────────────

function hexToNormalized(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// ────────────────── MiniGL ──────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */

class MiniGl {
  canvas: HTMLCanvasElement
  gl: WebGLRenderingContext
  meshes: any[] = []
  commonUniforms: Record<string, any> = {}
  width = 0
  height = 0

  Uniform: any
  Material: any
  PlaneGeometry: any
  Mesh: any

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl', { antialias: true })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl

    const ctx = gl
    const _miniGl = this

    // ── Attribute ──
    class Attr {
      type: number = ctx.FLOAT
      normalized = false
      buffer: WebGLBuffer
      target: number
      size: number
      values?: Float32Array | Uint16Array

      constructor(opts: { target: number; size: number; type?: number }) {
        this.target = opts.target
        this.size = opts.size
        if (opts.type !== undefined) this.type = opts.type
        this.buffer = ctx.createBuffer()!
        this.update()
      }
      update() {
        if (!this.values) return
        ctx.bindBuffer(this.target, this.buffer)
        ctx.bufferData(this.target, this.values, ctx.STATIC_DRAW)
      }
      attach(name: string, program: WebGLProgram) {
        const loc = ctx.getAttribLocation(program, name)
        if (this.target === ctx.ARRAY_BUFFER) {
          ctx.enableVertexAttribArray(loc)
          ctx.vertexAttribPointer(loc, this.size, this.type, this.normalized, 0, 0)
        }
        return loc
      }
      use(loc: number) {
        ctx.bindBuffer(this.target, this.buffer)
        if (this.target === ctx.ARRAY_BUFFER) {
          ctx.enableVertexAttribArray(loc)
          ctx.vertexAttribPointer(loc, this.size, this.type, this.normalized, 0, 0)
        }
      }
    }

    // ── Uniform ──
    class Uni {
      type: string
      value: any
      typeFn: string
      transpose = false
      excludeFrom?: string

      constructor(opts: { type?: string; value?: any; excludeFrom?: string }) {
        this.type = opts.type ?? 'float'
        this.value = opts.value
        this.excludeFrom = opts.excludeFrom
        const map: Record<string, string> = { float: '1f', int: '1i', vec2: '2fv', vec3: '3fv', vec4: '4fv', mat4: 'Matrix4fv' }
        this.typeFn = map[this.type] ?? '1f'
      }
      update(loc: WebGLUniformLocation) {
        if (this.value === undefined) return
        const fn = `uniform${this.typeFn}` as any
        if (this.typeFn.startsWith('Matrix')) {
          ;(ctx as any)[fn](loc, this.transpose, this.value)
        } else {
          ;(ctx as any)[fn](loc, this.value)
        }
      }
      getDeclaration(name: string, type: string, length?: number): string {
        if (this.excludeFrom === type) return ''
        if (this.type === 'array') {
          const arr = this.value as Uni[]
          return arr[0].getDeclaration(name, type, arr.length) + `\nconst int ${name}_length = ${arr.length};`
        }
        if (this.type === 'struct') {
          let n = name.replace('u_', '')
          n = n.charAt(0).toUpperCase() + n.slice(1)
          const body = Object.entries(this.value as Record<string, Uni>)
            .map(([k, u]) => u.getDeclaration(k, type).replace(/^uniform/, ''))
            .join('')
          return `uniform struct ${n} {\n${body}\n} ${name}${length && length > 0 ? `[${length}]` : ''};`
        }
        return `uniform ${this.type} ${name}${length && length > 0 ? `[${length}]` : ''};`
      }
    }

    // ── Material ──
    class Mat {
      program: WebGLProgram
      uniformInstances: { uniform: Uni; location: WebGLUniformLocation }[] = []
      uniforms: Record<string, Uni>

      constructor(vertexSrc: string, fragmentSrc: string, uniforms: Record<string, Uni>) {
        this.uniforms = uniforms
        const prefix = 'precision highp float;\n'
        const commonDecl = (t: string) =>
          Object.entries(_miniGl.commonUniforms).map(([n, u]: [string, any]) => u.getDeclaration(n, t)).join('\n')
        const uniDecl = (t: string) =>
          Object.entries(uniforms).map(([n, u]) => u.getDeclaration(n, t)).join('\n')

        const vs = `${prefix}\nattribute vec4 position;\nattribute vec2 uv;\nattribute vec2 uvNorm;\n${commonDecl('vertex')}\n${uniDecl('vertex')}\n${vertexSrc}`
        const fs = `${prefix}\n${commonDecl('fragment')}\n${uniDecl('fragment')}\n${fragmentSrc}`

        const compile = (type: number, src: string) => {
          const s = ctx.createShader(type)!
          ctx.shaderSource(s, src)
          ctx.compileShader(s)
          if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) console.error(ctx.getShaderInfoLog(s))
          return s
        }

        this.program = ctx.createProgram()!
        ctx.attachShader(this.program, compile(ctx.VERTEX_SHADER, vs))
        ctx.attachShader(this.program, compile(ctx.FRAGMENT_SHADER, fs))
        ctx.linkProgram(this.program)
        if (!ctx.getProgramParameter(this.program, ctx.LINK_STATUS)) console.error(ctx.getProgramInfoLog(this.program))
        ctx.useProgram(this.program)

        this.attachUniforms(undefined, _miniGl.commonUniforms)
        this.attachUniforms(undefined, this.uniforms)
      }

      attachUniforms(name: string | undefined, uniforms: any) {
        if (name === undefined) {
          Object.entries(uniforms).forEach(([n, u]: [string, any]) => this.attachUniforms(n, u))
        } else {
          const u = uniforms as Uni
          if (u.type === 'array') {
            ;(u.value as Uni[]).forEach((item, i) => this.attachUniforms(`${name}[${i}]`, item))
          } else if (u.type === 'struct') {
            Object.entries(u.value as Record<string, Uni>).forEach(([k, v]) => this.attachUniforms(`${name}.${k}`, v))
          } else {
            this.uniformInstances.push({
              uniform: u,
              location: ctx.getUniformLocation(this.program, name)!,
            })
          }
        }
      }
    }

    // ── PlaneGeometry ──
    class Geo {
      attributes: { position: Attr; uv: Attr; uvNorm: Attr; index: Attr }
      xSegCount = 0
      ySegCount = 0
      vertexCount = 0
      width = 1
      height = 1

      constructor() {
        this.attributes = {
          position: new Attr({ target: ctx.ARRAY_BUFFER, size: 3 }),
          uv: new Attr({ target: ctx.ARRAY_BUFFER, size: 2 }),
          uvNorm: new Attr({ target: ctx.ARRAY_BUFFER, size: 2 }),
          index: new Attr({ target: ctx.ELEMENT_ARRAY_BUFFER, size: 3, type: ctx.UNSIGNED_SHORT }),
        }
      }

      setTopology(xSeg: number, ySeg: number) {
        this.xSegCount = xSeg
        this.ySegCount = ySeg
        this.vertexCount = (xSeg + 1) * (ySeg + 1)
        const quadCount = xSeg * ySeg * 2
        this.attributes.uv.values = new Float32Array(2 * this.vertexCount)
        this.attributes.uvNorm.values = new Float32Array(2 * this.vertexCount)
        this.attributes.index.values = new Uint16Array(3 * quadCount)

        for (let y = 0; y <= ySeg; y++) {
          for (let x = 0; x <= xSeg; x++) {
            const i = y * (xSeg + 1) + x
            this.attributes.uv.values[2 * i] = x / xSeg
            this.attributes.uv.values[2 * i + 1] = 1 - y / ySeg
            this.attributes.uvNorm.values[2 * i] = (x / xSeg) * 2 - 1
            this.attributes.uvNorm.values[2 * i + 1] = 1 - (y / ySeg) * 2
            if (x < xSeg && y < ySeg) {
              const q = y * xSeg + x
              this.attributes.index.values[6 * q] = i
              this.attributes.index.values[6 * q + 1] = i + 1 + xSeg
              this.attributes.index.values[6 * q + 2] = i + 1
              this.attributes.index.values[6 * q + 3] = i + 1
              this.attributes.index.values[6 * q + 4] = i + 1 + xSeg
              this.attributes.index.values[6 * q + 5] = i + 2 + xSeg
            }
          }
        }
        this.attributes.uv.update()
        this.attributes.uvNorm.update()
        this.attributes.index.update()
      }

      setSize(w: number, h: number) {
        this.width = w
        this.height = h
        if (!this.attributes.position.values || this.attributes.position.values.length !== 3 * this.vertexCount) {
          this.attributes.position.values = new Float32Array(3 * this.vertexCount)
        }
        const ox = w / -2
        const oy = h / -2
        const sw = w / this.xSegCount
        const sh = h / this.ySegCount
        for (let y = 0; y <= this.ySegCount; y++) {
          const py = oy + y * sh
          for (let x = 0; x <= this.xSegCount; x++) {
            const px = ox + x * sw
            const idx = y * (this.xSegCount + 1) + x
            ;(this.attributes.position.values as Float32Array)[3 * idx] = px
            ;(this.attributes.position.values as Float32Array)[3 * idx + 1] = -py
          }
        }
        this.attributes.position.update()
      }
    }

    // ── Mesh ──
    class M {
      geometry: Geo
      material: Mat
      attributeInstances: { attribute: Attr; location: number }[] = []

      constructor(geometry: Geo, material: Mat) {
        this.geometry = geometry
        this.material = material
        Object.entries(geometry.attributes).forEach(([name, attr]) => {
          this.attributeInstances.push({ attribute: attr, location: attr.attach(name, material.program) })
        })
        _miniGl.meshes.push(this)
      }
      draw() {
        ctx.useProgram(this.material.program)
        this.material.uniformInstances.forEach(({ uniform, location }) => uniform.update(location))
        this.attributeInstances.forEach(({ attribute, location }) => attribute.use(location))
        ctx.drawElements(ctx.TRIANGLES, this.geometry.attributes.index.values!.length, ctx.UNSIGNED_SHORT, 0)
      }
    }

    this.Uniform = Uni
    this.Material = Mat
    this.PlaneGeometry = Geo
    this.Mesh = M

    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    this.commonUniforms = {
      projectionMatrix: new Uni({ type: 'mat4', value: identity }),
      modelViewMatrix: new Uni({ type: 'mat4', value: identity }),
      resolution: new Uni({ type: 'vec2', value: [1, 1] }),
      aspectRatio: new Uni({ type: 'float', value: 1 }),
    }
  }

  setSize(w: number, h: number) {
    this.width = w
    this.height = h
    this.canvas.width = w
    this.canvas.height = h
    this.gl.viewport(0, 0, w, h)
    this.commonUniforms.resolution.value = [w, h]
    this.commonUniforms.aspectRatio.value = w / h
  }

  setOrthographicCamera() {
    this.commonUniforms.projectionMatrix.value = [2 / this.width, 0, 0, 0, 0, 2 / this.height, 0, 0, 0, 0, -0.001, 0, 0, 0, 0, 1]
  }

  render() {
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.clearDepth(1)
    this.meshes.forEach((m: any) => m.draw())
  }
}

// ────────────────── Shaders ──────────────────

const NOISE_GLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);
  const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;
  vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`

const BLEND_GLSL = `
vec3 blendNormal(vec3 base,vec3 blend){return blend;}
vec3 blendNormal(vec3 base,vec3 blend,float opacity){return blendNormal(base,blend)*opacity+base*(1.-opacity);}`

const VERTEX_GLSL = `
varying vec3 v_color;
void main(){
  float time=u_time*u_global.noiseSpeed;
  vec2 noiseCoord=resolution*uvNorm*u_global.noiseFreq;
  float tilt=resolution.y/2.*uvNorm.y;
  float incline=resolution.x*uvNorm.x/2.*u_vertDeform.incline;
  float offset=resolution.x/2.*u_vertDeform.incline*mix(u_vertDeform.offsetBottom,u_vertDeform.offsetTop,uv.y);
  float noise=snoise(vec3(
    noiseCoord.x*u_vertDeform.noiseFreq.x+time*u_vertDeform.noiseFlow,
    noiseCoord.y*u_vertDeform.noiseFreq.y,
    time*u_vertDeform.noiseSpeed+u_vertDeform.noiseSeed
  ))*u_vertDeform.noiseAmp;
  noise*=1.-pow(abs(uvNorm.y),2.);
  noise=max(0.,noise);
  vec3 pos=vec3(position.x,position.y+tilt+incline+noise-offset,position.z);
  if(u_active_colors[0]==1.)v_color=u_baseColor;
  for(int i=0;i<u_waveLayers_length;i++){
    if(u_active_colors[i+1]==1.){
      WaveLayers layer=u_waveLayers[i];
      float n=smoothstep(layer.noiseFloor,layer.noiseCeil,snoise(vec3(
        noiseCoord.x*layer.noiseFreq.x+time*layer.noiseFlow,
        noiseCoord.y*layer.noiseFreq.y,
        time*layer.noiseSpeed+layer.noiseSeed
      ))/2.+.5);
      v_color=blendNormal(v_color,layer.color,pow(n,4.));
    }
  }
  gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
}`

const FRAGMENT_GLSL = `
varying vec3 v_color;
void main(){
  vec3 color=v_color;
  if(u_darken_top==1.){
    vec2 st=gl_FragCoord.xy/resolution.xy;
    color.g-=pow(st.y+sin(-12.)*st.x,u_shadow_power)*.4;
  }
  gl_FragColor=vec4(color,1.);
}`

// ────────────────── Gradient engine ──────────────────

class GradientEngine {
  private minigl: MiniGl
  private mesh: any
  private t = 1253106
  private last = 0
  private playing = false
  private raf = 0
  private colors: [number, number, number][]
  private seed = 5

  constructor(canvas: HTMLCanvasElement, colors: [number, number, number][]) {
    this.colors = colors
    this.minigl = new MiniGl(canvas)
    this.initMesh()
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  private initMesh() {
    const Uni = this.minigl.Uniform

    const uniforms: Record<string, any> = {
      u_time: new Uni({ value: 0 }),
      u_shadow_power: new Uni({ value: 5 }),
      u_darken_top: new Uni({ value: 0 }),
      u_active_colors: new Uni({ value: [1, 1, 1, 1], type: 'vec4' }),
      u_global: new Uni({
        value: {
          noiseFreq: new Uni({ value: [14e-5, 29e-5], type: 'vec2' }),
          noiseSpeed: new Uni({ value: 5e-6 }),
        },
        type: 'struct',
      }),
      u_vertDeform: new Uni({
        value: {
          incline: new Uni({ value: 0 }),
          offsetTop: new Uni({ value: -0.5 }),
          offsetBottom: new Uni({ value: -0.5 }),
          noiseFreq: new Uni({ value: [3, 4], type: 'vec2' }),
          noiseAmp: new Uni({ value: 320 }),
          noiseSpeed: new Uni({ value: 10 }),
          noiseFlow: new Uni({ value: 3 }),
          noiseSeed: new Uni({ value: this.seed }),
        },
        type: 'struct',
        excludeFrom: 'fragment',
      }),
      u_baseColor: new Uni({ value: this.colors[0], type: 'vec3', excludeFrom: 'fragment' }),
      u_waveLayers: new Uni({ value: [] as any[], excludeFrom: 'fragment', type: 'array' }),
    }

    for (let i = 1; i < this.colors.length; i++) {
      uniforms.u_waveLayers.value.push(
        new Uni({
          value: {
            color: new Uni({ value: this.colors[i], type: 'vec3' }),
            noiseFreq: new Uni({ value: [2 + i / this.colors.length, 3 + i / this.colors.length], type: 'vec2' }),
            noiseSpeed: new Uni({ value: 11 + 0.3 * i }),
            noiseFlow: new Uni({ value: 6.5 + 0.3 * i }),
            noiseSeed: new Uni({ value: this.seed + 10 * i }),
            noiseFloor: new Uni({ value: 0.1 }),
            noiseCeil: new Uni({ value: 0.63 + 0.07 * i }),
          },
          type: 'struct',
        }),
      )
    }

    const vertexShader = [NOISE_GLSL, BLEND_GLSL, VERTEX_GLSL].join('\n\n')
    const material = new this.minigl.Material(vertexShader, FRAGMENT_GLSL, uniforms)
    const geometry = new this.minigl.PlaneGeometry()
    this.mesh = new this.minigl.Mesh(geometry, material)
  }

  private resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.minigl.setSize(w, h)
    this.minigl.setOrthographicCamera()
    const xSeg = Math.ceil(w * 0.06)
    const ySeg = Math.ceil(h * 0.16)
    this.mesh.geometry.setTopology(xSeg, ySeg)
    this.mesh.geometry.setSize(w, h)
    this.mesh.material.uniforms.u_shadow_power.value = w < 600 ? 5 : 6
  }

  private animate = (ts: number) => {
    if (!this.playing) return
    this.t += Math.min(ts - this.last, 1000 / 15)
    this.last = ts
    this.mesh.material.uniforms.u_time.value = this.t
    this.minigl.render()
    this.raf = requestAnimationFrame(this.animate)
  }

  play() {
    if (this.playing) return
    this.playing = true
    this.raf = requestAnimationFrame(this.animate)
  }

  destroy() {
    this.playing = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
  }
}

// ────────────────── React component ──────────────────

interface MeshGradientProps {
  colors?: [string, string, string, string]
  className?: string
}

export function MeshGradient({
  colors = ['#C3423F', '#D4785C', '#E8A87C', '#FBDBB2'],
  className,
}: MeshGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const normalized = colors.map(hexToNormalized) as [number, number, number][]
    const engine = new GradientEngine(canvas, normalized)
    engine.play()

    return () => engine.destroy()
  }, [colors])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}
