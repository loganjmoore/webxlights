/*{
  "DESCRIPTION": "A bright comet with a trailing tail circling the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "cometColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "tailColor", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 center = vec2(0.5, 0.5);
  
  // Angle of comet orbit
  float angle = TIME * speed * 0.5 + 6.28318530718;
  
  // Comet position on a circle
  float radius = 0.35;
  vec2 cometPos = center + vec2(cos(angle), sin(angle) * 0.6) * radius;
  
  // Direction vector (tail points backward along orbit)
  vec2 tailDir = vec2(-sin(angle), -cos(angle) * 0.6);
  
  // Distance from pixel to comet center
  float distToComet = distance(uv, cometPos);
  
  // Distance from pixel to tail line
  vec2 toPixel = uv - cometPos;
  float tailDist = length(toPixel - tailDir * dot(toPixel, tailDir));
  
  // Project pixel onto tail direction
  float tailProj = dot(toPixel, tailDir);
  
  // Bright comet core
  float comet = smoothstep(0.04, 0.0, distToComet);
  
  // Tail: gradient fading backward
  float tailFade = smoothstep(tailLength, 0.0, tailProj);
  float tailWidth = smoothstep(0.03, 0.0, tailDist);
  float tail = tailFade * tailWidth * (1.0 - tailProj / tailLength);
  
  // Combine comet and tail
  vec3 color = mix(tailColor.rgb, cometColor.rgb, comet);
  float brightness = max(comet, tail * 0.8);
  
  gl_FragColor = vec4(color * brightness, 1.0);
}
