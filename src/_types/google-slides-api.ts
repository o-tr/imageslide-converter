export type SlidePageElement = {
  objectId?: string;
  size?: {
    width: { magnitude: number; unit: string };
    height: { magnitude: number; unit: string };
  };
  transform?: {
    scaleX?: number;
    scaleY?: number;
    shearX?: number;
    shearY?: number;
    translateX?: number;
    translateY?: number;
    unit?: string;
  };
  image?: {
    contentUrl?: string;
    sourceUrl?: string;
  };
  shape?: {
    shapeType: string;
    text?: {
      textElements: {
        textRun?: {
          content: string;
        };
      }[];
    };
  };
};

export type GetSlideResponse = {
  result: {
    slides: {
      objectId: string;
      pageElements: SlidePageElement[];
      pageProperties: unknown;
      slideProperties: {
        isSkipped?: boolean;
        notesPage: {
          pageElements: {
            shape: {
              shapeType: "TEXT_BOX";
              text?: {
                textElements: {
                  textRun?: {
                    content: string;
                  };
                }[];
              };
            };
          }[];
        };
      };
    }[];
    pageSize: {
      width: { magnitude: number; unit: string };
      height: { magnitude: number; unit: string };
    };
    title: string;
  };
};

export type GetThumbnailResponse = {
  result: {
    contentUrl: string;
  };
};
