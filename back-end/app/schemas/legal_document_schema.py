from pydantic import BaseModel, ConfigDict

from app.schemas.datas import DataComFuso


class LegalDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_type: str
    version: str
    content: str
    published_at: DataComFuso
