/*{
  "DESCRIPTION": "Fire rises from the bottom with flickering flames",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "colorHot", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.0, 1.0] },
    { "NAME": "colorCool", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] }
  ]
}*/

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float h = uv.y;
  float w = uv.x;
  
  if (RENDERSIZE.y < 2.0) {
    h = uv.x;
    w = uv.y;
  }
  
  float t = TIME * speed * 0.5;
  float flame = noise(w * scale + t * 1.2) * noise(w * scale * 0.5 - t * 0.7);
  flame += noise(w * scale * 2.0 + t * 0.9) * 0.5;
  
  float rise = (h - 0.2) * 4.0 + t * 0.8;
  float lift = sin(rise + flame * 3.0) * 0.3 + 0.3;
  
  float intensity = smoothstep(0.0, 0.1, h) * smoothstep(1.0, 0.3, h);
  intensity *= flame * lift * 1.5;
  
  vec3 fireColor = mix(colorCool.rgb, colorHot.rgb, smoothstep(0.2, 0.8, flame));
  
  gl_FragColor = vec4(fireColor * intensity, 1.0);
}
